"use client";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (key: string) => void;
}

export function TabBar({ tabs, activeTab, onChange }: TabBarProps) {
  return (
    <div className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
