"""Occupant counting and seat attribution.

## What is implemented here, and what is not

**The attribution geometry is complete.** Mapping a person detection to a seat,
deduplicating overlapping boxes, deciding which seats a given camera placement
can legitimately report on, and distinguishing "empty" from "could not see" —
all of that is below and all of it is testable without a model.

**The person detector is not installed.** Finding people in pixels needs a
vision model, and `OccupancyDetector` in `engine.py` is the contract for one.

That split puts the product's judgement in reviewable code and leaves the
commodity part to a commodity. The judgement here is mostly about what *not* to
claim: a driver-facing camera reporting "1 occupant" in a vehicle carrying four
is worse than one reporting "cannot see the back row", because the first answer
is actionable and wrong.

## Counting, never identifying

No embedding is computed, no occupant is tracked across trips, and no attribute
is derived. `engine.guard_against_identification` enforces this against the
detector; the functions here have no parameter that could carry it.
"""

from __future__ import annotations

from dataclasses import dataclass

import structlog

from app.cabin.schemas import (
    CameraPlacement,
    OccupancyResponse,
    SeatObservation,
    SeatPosition,
    SeatState,
)

logger = structlog.get_logger(__name__)

MODEL_ID = "cabin-occupancy-v1"

#: Which seats each placement can legitimately report on.
#:
#: Mirrors `PLACEMENT_CAPABILITY` in `packages/shared/src/cabin/sensors.ts`. A
#: driver-facing lens sees one seat; letting it report an occupant count would
#: make "1" the answer in a vehicle carrying four, and the under-count would be
#: invisible in exactly the situation the product exists for.
OBSERVABLE_SEATS: dict[CameraPlacement, frozenset[SeatPosition]] = {
    CameraPlacement.DRIVER_FACING: frozenset({SeatPosition.DRIVER}),
    CameraPlacement.CABIN_WIDE: frozenset(SeatPosition),
    CameraPlacement.REAR_CABIN: frozenset(
        {SeatPosition.REAR_LEFT, SeatPosition.REAR_CENTRE, SeatPosition.REAR_RIGHT}
    ),
    CameraPlacement.CARGO: frozenset(),
}

#: Normalised x-ranges for each seat, in a cabin-wide frame.
#:
#: Right-hand drive: the driver sits on the right of the image. The launch
#: market is South Africa, and getting this backwards would attribute every
#: driver-space encroachment to the wrong person.
SEAT_X_RANGES: dict[SeatPosition, tuple[float, float]] = {
    SeatPosition.FRONT_PASSENGER: (0.00, 0.35),
    SeatPosition.DRIVER: (0.65, 1.00),
    SeatPosition.REAR_LEFT: (0.00, 0.33),
    SeatPosition.REAR_CENTRE: (0.33, 0.67),
    SeatPosition.REAR_RIGHT: (0.67, 1.00),
}

#: Boxes above this y-centre are treated as the rear row.
REAR_ROW_Y_THRESHOLD = 0.55

#: Intersection-over-union above which two boxes are the same person.
DEDUPLICATION_IOU = 0.45

#: Below this, a person detection is not counted.
PERSON_CONFIDENCE_FLOOR = 0.5


@dataclass(frozen=True)
class PersonBox:
    """A detected person. Carries no identity and cannot be made to."""

    x: float
    y: float
    width: float
    height: float
    confidence: float

    @property
    def centre(self) -> tuple[float, float]:
        return (self.x + self.width / 2, self.y + self.height / 2)


def intersection_over_union(a: PersonBox, b: PersonBox) -> float:
    """Standard IoU. Used only to merge duplicates, never to track identity."""
    left = max(a.x, b.x)
    top = max(a.y, b.y)
    right = min(a.x + a.width, b.x + b.width)
    bottom = min(a.y + a.height, b.y + b.height)

    if right <= left or bottom <= top:
        return 0.0

    overlap = (right - left) * (bottom - top)
    union = a.width * a.height + b.width * b.height - overlap

    return overlap / union if union > 0 else 0.0


def deduplicate(boxes: list[PersonBox]) -> list[PersonBox]:
    """Merges overlapping detections of the same person.

    A person straddling two detector anchors produces two boxes, and counting
    both would report a phantom occupant. Keeps the more confident box of each
    overlapping pair.
    """
    ordered = sorted(boxes, key=lambda box: box.confidence, reverse=True)
    kept: list[PersonBox] = []

    for box in ordered:
        if any(intersection_over_union(box, existing) >= DEDUPLICATION_IOU for existing in kept):
            continue
        kept.append(box)

    return kept


def attribute_seat(box: PersonBox, placement: CameraPlacement) -> SeatPosition | None:
    """Maps a person box to a seat, or None when it cannot be attributed.

    Returns None rather than guessing. An occupant attributed to the wrong seat
    turns "someone is leaning into the driver's space" into a false alarm, or
    hides a real one.
    """
    observable = OBSERVABLE_SEATS[placement]
    if not observable:
        return None

    centre_x, centre_y = box.centre
    rear = centre_y >= REAR_ROW_Y_THRESHOLD

    candidates = [
        position
        for position in observable
        if _is_rear(position) == rear and _in_range(centre_x, position)
    ]

    if len(candidates) == 1:
        return candidates[0]

    # Ambiguous or unmatched. A box straddling two seat ranges is genuinely
    # unattributable and saying so is more useful than picking one.
    return None


def _is_rear(position: SeatPosition) -> bool:
    return position in {
        SeatPosition.REAR_LEFT,
        SeatPosition.REAR_CENTRE,
        SeatPosition.REAR_RIGHT,
    }


def _in_range(x: float, position: SeatPosition) -> bool:
    low, high = SEAT_X_RANGES[position]
    return low <= x <= high


def count_occupants(
    boxes: list[PersonBox],
    placement: CameraPlacement,
    mean_frame_quality: float,
) -> OccupancyResponse:
    """Counts occupants and attributes them to seats where possible.

    The count is the number of deduplicated person detections, **not** the
    number of seats marked occupied. Those differ whenever someone cannot be
    attributed, and the count is the figure that matters — an unattributable
    fourth person in a vehicle expecting one is still a fourth person.
    """
    confident = [box for box in boxes if box.confidence >= PERSON_CONFIDENCE_FLOOR]
    people = deduplicate(confident)

    observable = OBSERVABLE_SEATS[placement]
    attributed: dict[SeatPosition, PersonBox] = {}

    for box in people:
        seat = attribute_seat(box, placement)
        if seat is None:
            continue

        # Two people attributed to one seat means the attribution is wrong, not
        # that the seat holds two. Keep the more confident and leave the other
        # counted but unattributed.
        existing = attributed.get(seat)
        if existing is None or box.confidence > existing.confidence:
            attributed[seat] = box

    seats = [
        SeatObservation(
            position=position,
            state=SeatState.OCCUPIED if position in attributed else SeatState.EMPTY,
            confidence=round(
                attributed[position].confidence if position in attributed else mean_frame_quality,
                3,
            ),
        )
        for position in sorted(observable, key=lambda seat: seat.value)
    ]

    unobserved = sorted(
        (position for position in SeatPosition if position not in observable),
        key=lambda seat: seat.value,
    )

    # Confidence is bounded by frame quality and by how much of the cabin this
    # placement can see at all. A perfect read of one third of the cabin is not
    # a confident occupant count.
    coverage = len(observable) / len(SeatPosition) if observable else 0.0
    confidence = min(1.0, mean_frame_quality * (0.4 + 0.6 * coverage))

    logger.debug(
        "cabin.counted",
        placement=placement,
        raw=len(boxes),
        counted=len(people),
        attributed=len(attributed),
        unobserved=len(unobserved),
    )

    return OccupancyResponse(
        instantaneous_count=len(people),
        seats=seats,
        unobserved_positions=unobserved,
        confidence=round(confidence, 3),
        model_id=MODEL_ID,
    )
