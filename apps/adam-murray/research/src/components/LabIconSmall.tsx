import { VectorSquare, Route, BrainCircuit } from "lucide-react";

interface LabIconSmallProps {
  icon: "VectorSquare" | "Route" | "BrainCircuit";
  rotation?: string;
  color: string;
}

export default function LabIconSmall({ icon, rotation = "0deg", color }: LabIconSmallProps) {
  const iconMap = {
    VectorSquare,
    Route,
    BrainCircuit,
  };

  const Icon = iconMap[icon];

  return (
    <Icon
      className={`w-6 h-6 text-${color}-600`}
      style={{ transform: `rotate(${rotation})` }}
    />
  );
}
