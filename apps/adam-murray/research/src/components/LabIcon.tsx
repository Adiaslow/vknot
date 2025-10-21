import { VectorSquare, Route, BrainCircuit } from "lucide-react";

interface LabIconProps {
  icon: "VectorSquare" | "Route" | "BrainCircuit";
  rotation: string;
  color: string;
}

export default function LabIcon({ icon, rotation, color }: LabIconProps) {
  const iconMap = {
    VectorSquare,
    Route,
    BrainCircuit,
  };

  const Icon = iconMap[icon];

  return (
    <Icon
      className={`w-8 h-8 text-${color}-600`}
      style={{ transform: `rotate(${rotation})` }}
    />
  );
}
