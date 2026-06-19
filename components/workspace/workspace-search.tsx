import { Search } from 'lucide-react';

interface WorkspaceSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function WorkspaceSearch({ value, onChange }: WorkspaceSearchProps) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-md border border-sidebar-border/70 bg-background/70 px-2.5 text-sm shadow-[inset_0_1px_1px_rgba(15,23,42,0.03)]">
      <Search className="text-muted-foreground" size={14} strokeWidth={1.75} />
      <input
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        placeholder="搜索"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
