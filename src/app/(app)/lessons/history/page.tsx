"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LessonHistoryPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/lessons");
  }, [router]);
  return null;
}
