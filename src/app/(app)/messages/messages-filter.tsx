"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MessagesFilter({
  tutors,
  current,
}: {
  tutors: { id: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(value: string) {
    const params = new URLSearchParams();
    if (value !== "all") params.set("tutor", value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <Select value={current} onValueChange={(val) => handleChange(val ?? "all")}>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="All tutors" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All tutors</SelectItem>
        {tutors.map((t) => (
          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
