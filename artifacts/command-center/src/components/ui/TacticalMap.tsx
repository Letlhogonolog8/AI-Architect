import { useEffect, useState } from "react";

export function TacticalMap() {
  const [vehiclePos, setVehiclePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let frame = 0;
    const animate = () => {
      frame += 0.5;
      setVehiclePos({
        x: Math.sin(frame * 0.02) * 30,
        y: Math.cos(frame * 0.015) * 20
      });
      requestAnimationFrame(animate);
    };
    const id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="relative w-full h-full bg-[#080c14] rounded-xl overflow-hidden">
      <svg viewBox="0 0 800 420" className="w-full h-full">
        {/* Grid */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0, 212, 255, 0.06)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="800" height="420" fill="url(#grid)" />

        {/* Roads */}
        <path d="M 100 100 Q 200 150 350 120 T 700 200" stroke="rgba(255,255,255,0.1)" strokeWidth="12" fill="none" />
        <path d="M 150 350 L 400 300 L 650 320" stroke="rgba(255,255,255,0.1)" strokeWidth="10" fill="none" />
        <path d="M 50 200 Q 150 180 250 220 T 450 200" stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="none" />

        {/* Crime Hotspots */}
        <circle cx="580" cy="220" r="60" fill="rgba(239, 68, 68, 0.15)" stroke="rgba(239, 68, 68, 0.3)" strokeWidth="1" />
        <circle cx="280" cy="180" r="50" fill="rgba(239, 68, 68, 0.12)" stroke="rgba(239, 68, 68, 0.25)" strokeWidth="1" />
        <circle cx="450" cy="310" r="45" fill="rgba(239, 68, 68, 0.1)" stroke="rgba(239, 68, 68, 0.2)" strokeWidth="1" />

        {/* Safe Corridors */}
        <polyline points="100,100 200,150 350,120 500,140 650,180" fill="none" stroke="rgba(0, 212, 255, 0.4)" strokeWidth="2" strokeDasharray="5,5" />
        <polyline points="150,350 300,320 450,300 600,310" fill="none" stroke="rgba(0, 212, 255, 0.4)" strokeWidth="2" strokeDasharray="5,5" />

        {/* Police Stations */}
        <polygon points="120,80 130,90 120,100 110,90" fill="rgba(0, 212, 255, 0.6)" stroke="rgba(0, 212, 255, 0.9)" strokeWidth="1" />
        <polygon points="420,260 430,270 420,280 410,270" fill="rgba(0, 212, 255, 0.6)" stroke="rgba(0, 212, 255, 0.9)" strokeWidth="1" />
        <polygon points="680,150 690,160 680,170 670,160" fill="rgba(0, 212, 255, 0.6)" stroke="rgba(0, 212, 255, 0.9)" strokeWidth="1" />

        {/* Vehicles */}
        <g>
          <circle cx="200" cy="150" r="5" fill="rgba(56, 189, 248, 0.8)" stroke="rgba(56, 189, 248, 1)" strokeWidth="1.5" />
          <text x="200" y="170" fill="rgba(56, 189, 248, 0.9)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">VEH-01</text>
        </g>
        <g>
          <circle cx="450" cy="200" r="5" fill="rgba(34, 197, 94, 0.8)" stroke="rgba(34, 197, 94, 1)" strokeWidth="1.5" />
          <text x="450" y="220" fill="rgba(34, 197, 94, 0.9)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">VEH-02</text>
        </g>
        <g transform={`translate(${vehiclePos.x}, ${vehiclePos.y})`}>
          <circle cx="580" cy="220" r="6" fill="rgba(239, 68, 68, 0.9)" stroke="rgba(239, 68, 68, 1)" strokeWidth="2" />
          <circle cx="580" cy="220" r="12" fill="none" stroke="rgba(239, 68, 68, 0.6)" strokeWidth="1">
            <animate attributeName="r" from="6" to="20" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.8" to="0" dur="2s" repeatCount="indefinite" />
          </circle>
          <text x="580" y="240" fill="rgba(239, 68, 68, 1)" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle" fontWeight="700">VEH-03</text>
        </g>
        <g>
          <circle cx="300" cy="320" r="5" fill="rgba(245, 158, 11, 0.8)" stroke="rgba(245, 158, 11, 1)" strokeWidth="1.5" />
          <text x="300" y="340" fill="rgba(245, 158, 11, 0.9)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">VEH-04</text>
        </g>
        <g>
          <circle cx="650" cy="180" r="5" fill="rgba(34, 197, 94, 0.8)" stroke="rgba(34, 197, 94, 1)" strokeWidth="1.5" />
          <text x="650" y="200" fill="rgba(34, 197, 94, 0.9)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle">VEH-05</text>
        </g>

        {/* Coordinate Overlay */}
        <text x="12" y="20" fill="rgba(255,255,255,0.4)" fontSize="11" fontFamily="var(--font-mono)">-26.1234, 28.0456 | ALT: 1640m</text>

        {/* Legend */}
        <g transform="translate(12, 360)">
          <circle cx="5" cy="5" r="4" fill="rgba(34, 197, 94, 0.8)" />
          <text x="15" y="9" fill="rgba(255,255,255,0.5)" fontSize="9" fontFamily="var(--font-mono)">Safe</text>
          
          <circle cx="60" cy="5" r="4" fill="rgba(245, 158, 11, 0.8)" />
          <text x="70" y="9" fill="rgba(255,255,255,0.5)" fontSize="9" fontFamily="var(--font-mono)">Alert</text>
          
          <circle cx="120" cy="5" r="4" fill="rgba(239, 68, 68, 0.9)" />
          <text x="130" y="9" fill="rgba(255,255,255,0.5)" fontSize="9" fontFamily="var(--font-mono)">Emergency</text>

          <line x1="200" y1="5" x2="230" y2="5" stroke="rgba(0, 212, 255, 0.4)" strokeWidth="2" strokeDasharray="3,3" />
          <text x="235" y="9" fill="rgba(255,255,255,0.5)" fontSize="9" fontFamily="var(--font-mono)">SafeCorridor</text>
        </g>

        {/* Integration Badge */}
        <rect x="650" y="12" width="140" height="20" fill="rgba(0, 212, 255, 0.1)" stroke="rgba(0, 212, 255, 0.3)" strokeWidth="1" rx="3" />
        <text x="720" y="25" fill="rgba(0, 212, 255, 0.8)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="middle" fontWeight="700">MAPBOX INTEGRATION</text>
      </svg>
    </div>
  );
}