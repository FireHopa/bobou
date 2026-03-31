import { Input } from "@/components/ui/input";

export function StepInput({
  label,
  value,
  onChange,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === "Enter" && onEnter()}
      />
    </div>
  );
}
