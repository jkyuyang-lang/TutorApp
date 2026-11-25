"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, X, GripVertical } from "lucide-react";
import { CollapsibleCard } from "@/components/collapsible-card";
import { CARRIER_OPTIONS } from "@/lib/carriers";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Subject {
  id: string;
  name: string;
  category: string | null;
}

interface TutorSubject {
  id: string;
  subject_id: string;
  levels: string[];
  format: string;
  durations: number[];
  prices: Record<string, number>;
  active: boolean;
  sort_order: number;
  subjects: Subject;
}

const DURATION_OPTIONS = [30, 60, 90, 120];

// Calendar constants & helpers
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIME_SLOTS: string[] = [];
for (let h = 0; h <= 23; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

interface AvailRule {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  format: string;
}

interface TimeOffEntry {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

function calCellKey(day: number, time: string): string {
  return `${day}-${time}`;
}

function rulesToCells(rules: AvailRule[]): Set<string> {
  const cells = new Set<string>();
  for (const rule of rules) {
    const startIdx = TIME_SLOTS.indexOf(rule.start_time.slice(0, 5));
    const endTime = rule.end_time.slice(0, 5);
    let endIdx = TIME_SLOTS.indexOf(endTime);
    if (endIdx === -1) endIdx = TIME_SLOTS.length;
    if (startIdx === -1) continue;
    for (let i = startIdx; i < endIdx; i++) {
      cells.add(calCellKey(rule.day_of_week, TIME_SLOTS[i]));
    }
  }
  return cells;
}

function cellsToRules(cells: Set<string>): Array<{ day_of_week: number; start_time: string; end_time: string }> {
  const rules: Array<{ day_of_week: number; start_time: string; end_time: string }> = [];
  for (let day = 0; day < 7; day++) {
    let rangeStart: string | null = null;
    for (let i = 0; i < TIME_SLOTS.length; i++) {
      const key = calCellKey(day, TIME_SLOTS[i]);
      const isSelected = cells.has(key);
      if (isSelected && rangeStart === null) rangeStart = TIME_SLOTS[i];
      if (!isSelected && rangeStart !== null) {
        rules.push({ day_of_week: day, start_time: rangeStart, end_time: TIME_SLOTS[i] });
        rangeStart = null;
      }
    }
    if (rangeStart !== null) {
      const lastSlot = TIME_SLOTS[TIME_SLOTS.length - 1];
      const [h, m] = lastSlot.split(":").map(Number);
      const endH = m === 30 ? h + 1 : h;
      const endM = m === 30 ? 0 : 30;
      const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
      rules.push({ day_of_week: day, start_time: rangeStart, end_time: endTime });
    }
  }
  return rules;
}

function formatTimeAmPm(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function SortableProfileSubject({
  ts,
  isEditing,
  courseEditUI,
  resetSubjectForm,
  saveSubject,
  subjectSaving,
  startEditSubject,
  toggleActive,
  removeSubject,
}: {
  ts: TutorSubject;
  isEditing: boolean;
  courseEditUI: React.ReactNode;
  resetSubjectForm: () => void;
  saveSubject: () => void;
  subjectSaving: boolean;
  startEditSubject: (ts: TutorSubject) => void;
  toggleActive: (ts: TutorSubject) => void;
  removeSubject: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ts.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border p-4 transition-colors ${
        isEditing
          ? "ring-2 ring-primary border-primary bg-primary/5"
          : !ts.active
            ? "opacity-60"
            : ""
      }`}
    >
      {isEditing ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Editing: {ts.subjects.name}</span>
            <Button type="button" variant="ghost" size="sm" onClick={resetSubjectForm}>
              <X className="size-4" />
            </Button>
          </div>

          {courseEditUI}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" className="border-black" onClick={resetSubjectForm}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveSubject}
              disabled={subjectSaving}
              size="sm"
            >
              {subjectSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="cursor-grab text-muted-foreground hover:text-foreground shrink-0 touch-none mt-0.5"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <div className="flex items-start justify-between flex-1 min-w-0">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{ts.subjects.name}</span>
                {!ts.active && <Badge variant="secondary">Inactive</Badge>}
              </div>
              {ts.levels.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ts.levels.map((level) => (
                    <Badge key={level} variant="outline" className="text-xs">
                      {level}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button type="button" variant="ghost" size="sm" onClick={() => startEditSubject(ts)}>
                <Pencil className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => toggleActive(ts)}>
                {ts.active ? "Deactivate" : "Activate"}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeSubject(ts.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TutorProfileContent({ targetProfileId }: { targetProfileId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const cal = searchParams.get("calendar");
    const error = searchParams.get("error");
    if (cal === "connected") return "Google Calendar connected successfully!";
    if (error === "oauth_failed") return "Error: Failed to connect Google Calendar. Please try again.";
    if (error === "missing_params") return "Error: OAuth callback was missing required parameters.";
    return null;
  });
  const [profileForm, setProfileForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    phone_carrier: "",
    time_zone: "",
  });
  const [tutorForm, setTutorForm] = useState({
    id: "",
    slug: "",
    bio: "",
    credentials: "",
    education: "",
    years_experience: "",
    video_url: "",
    meeting_link: "",
    meeting_platform: "" as string,
    email_alias: "",
  });

  // Admin-enabled meeting platforms
  const [enabledPlatforms, setEnabledPlatforms] = useState<string[]>([]);

  // Tutor-level pricing state
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("");
  const [selectedDurations, setSelectedDurations] = useState<number[]>([60]);
  const [pricePerHour, setPricePerHour] = useState("");
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingMessage, setPricingMessage] = useState<string | null>(null);

  // Locations state
  interface TutorLocation {
    address: string;
    lat: number;
    lng: number;
    radius_miles: number;
    place_id: string;
  }
  const [locations, setLocations] = useState<TutorLocation[]>([]);
  const [offersInPerson, setOffersInPerson] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [locationRadius, setLocationRadius] = useState("10");
  const [locationSuggestions, setLocationSuggestions] = useState<{ description: string; place_id: string }[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<{ address: string; place_id: string } | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DnD sensors
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Subjects state
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [tutorSubjects, setTutorSubjects] = useState<TutorSubject[]>([]);
  const [subjectMessage, setSubjectMessage] = useState<string | null>(null);
  const [subjectSaving, setSubjectSaving] = useState(false);

  // Add/edit subject form (now only subject + courses)
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedAddCategory, setSelectedAddCategory] = useState("");
  const [subjectCourses, setSubjectCourses] = useState<string[]>([]);
  const [newCourse, setNewCourse] = useState("");
  const [editingCourseIndex, setEditingCourseIndex] = useState<number | null>(null);
  const [editingCourseValue, setEditingCourseValue] = useState("");

  // Calendar state
  const [availRules, setAvailRules] = useState<AvailRule[]>([]);
  const [timeOffs, setTimeOffs] = useState<TimeOffEntry[]>([]);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [hasAvailChanges, setHasAvailChanges] = useState(false);
  const [availSaving, setAvailSaving] = useState(false);
  const lastClickedRef = useRef<{ day: number; timeIdx: number } | null>(null);
  const [toSelectedDates, setToSelectedDates] = useState<Set<string>>(new Set());
  const [toLastClicked, setToLastClicked] = useState<string | null>(null);
  const [toReason, setToReason] = useState("");
  const [calendarProvider, setCalendarProvider] = useState<string>("none");
  const [tutorTimeZone, setTutorTimeZone] = useState<string>("");
  const [disconnecting, setDisconnecting] = useState(false);

  function handlePhoneChange(value: string) {
    setProfileForm((prev) => ({ ...prev, phone: formatPhone(value) }));
  }

  function handleLocationSearch(value: string) {
    setLocationInput(value);
    setSelectedPlace(null);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!value.trim()) {
      setLocationSuggestions([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?action=autocomplete&input=${encodeURIComponent(value)}`);
        const data = await res.json();
        setLocationSuggestions(
          (data.predictions ?? []).map((p: { description: string; place_id: string }) => ({
            description: p.description,
            place_id: p.place_id,
          }))
        );
      } catch {
        setLocationSuggestions([]);
      }
    }, 300);
  }

  function selectSuggestion(prediction: { description: string; place_id: string }) {
    setLocationInput(prediction.description);
    setSelectedPlace({ address: prediction.description, place_id: prediction.place_id });
    setLocationSuggestions([]);
  }

  async function addLocation() {
    if (!selectedPlace) return;
    try {
      const res = await fetch(`/api/places?action=geocode&place_id=${selectedPlace.place_id}`);
      const data = await res.json();
      const result = data.results?.[0];
      if (!result) return;
      setLocations((prev) => [
        ...prev,
        {
          address: selectedPlace.address,
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
          radius_miles: parseInt(locationRadius) || 10,
          place_id: selectedPlace.place_id,
        },
      ]);
      setLocationInput("");
      setSelectedPlace(null);
      setLocationRadius("10");
    } catch {
      // geocode failed
    }
  }

  function removeLocation(index: number) {
    setLocations((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveLocations() {
    if (!tutorId) return;
    setPricingSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("tutors")
      .update({ locations })
      .eq("id", tutorId);
    setPricingMessage(error ? `Error: ${error.message}` : "Locations saved!");
    setPricingSaving(false);
  }

  const loadData = useCallback(async () => {
    const supabase = createClient();

    let profile;
    if (targetProfileId) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", targetProfileId)
        .single();
      profile = data;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      profile = data;
    }
    if (!profile) return;

    const { data: tutor } = await supabase
      .from("tutors")
      .select("*, calendar_provider")
      .eq("profile_id", profile.id)
      .single();
    if (!tutor) return;

    setUserRole(profile.role || "");
    setTutorTimeZone(profile.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone);
    setCalendarProvider(tutor.calendar_provider || "none");

    const nameParts = (profile.full_name || "").split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    setProfileForm({
      first_name: firstName,
      last_name: lastName,
      phone: formatPhone(profile.phone || ""),
      phone_carrier: profile.phone_carrier || "",
      time_zone: profile.time_zone || "",
    });
    setTutorForm({
      id: tutor.id,
      slug: tutor.slug || "",
      bio: tutor.bio || "",
      credentials: tutor.credentials || "",
      education: tutor.education || "",
      years_experience: tutor.years_experience?.toString() || "",
      video_url: tutor.video_url || "",
      meeting_link: tutor.meeting_link || "",
      meeting_platform: tutor.meeting_platform || "",
      email_alias: tutor.email_alias || "",
    });
    setTutorId(tutor.id);

    // Load admin-enabled meeting platforms
    const { data: platformsSetting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "meeting_platforms")
      .single();
    setEnabledPlatforms((platformsSetting?.value as string[]) ?? []);

    // Load tutor-level pricing & locations
    setSelectedDurations(tutor.session_durations ?? [60]);
    setPricePerHour(tutor.hourly_rate ? String(tutor.hourly_rate) : "");
    const locs = (tutor.locations as TutorLocation[]) ?? [];
    setLocations(locs);
    setOffersInPerson(locs.length > 0);

    // Load subjects and calendar data
    const [subjectsRes, tutorSubjectsRes, rulesRes, timeOffRes] = await Promise.all([
      supabase.from("subjects").select("*").order("category").order("name"),
      supabase
        .from("tutor_subjects")
        .select("*, subjects(*)")
        .eq("tutor_id", tutor.id)
        .order("sort_order"),
      supabase
        .from("availability_rules")
        .select("*")
        .eq("tutor_id", tutor.id)
        .order("day_of_week")
        .order("start_time"),
      supabase
        .from("time_off")
        .select("*")
        .eq("tutor_id", tutor.id)
        .gte("ends_at", new Date().toISOString())
        .order("starts_at"),
    ]);

    setAllSubjects(subjectsRes.data ?? []);
    setTutorSubjects((tutorSubjectsRes.data as TutorSubject[]) ?? []);

    const loadedRules = rulesRes.data ?? [];
    setAvailRules(loadedRules);
    setSelectedCells(rulesToCells(loadedRules));
    setTimeOffs(timeOffRes.data ?? []);
    setHasAvailChanges(false);
    setLoading(false);
  }, [targetProfileId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const supabase = createClient();

    let profileFilter: { column: string; value: string };
    if (targetProfileId) {
      profileFilter = { column: "id", value: targetProfileId };
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      profileFilter = { column: "user_id", value: user.id };
    }

    const [profileRes, tutorRes] = await Promise.all([
      supabase
        .from("profiles")
        .update({
          full_name: `${profileForm.first_name.trim()} ${profileForm.last_name.trim()}`.trim(),
          phone: profileForm.phone || null,
          phone_carrier: profileForm.phone_carrier || null,
          time_zone: profileForm.time_zone,
        })
        .eq(profileFilter.column, profileFilter.value),
      supabase
        .from("tutors")
        .update({
          slug: tutorForm.slug || null,
          bio: tutorForm.bio || null,
          credentials: tutorForm.credentials || null,
          education: tutorForm.education || null,
          years_experience: tutorForm.years_experience
            ? parseInt(tutorForm.years_experience)
            : null,
          video_url: tutorForm.video_url || null,
          meeting_platform: tutorForm.meeting_platform || null,
          meeting_link: tutorForm.meeting_platform === "zoom" ? (tutorForm.meeting_link || null) : null,
          email_alias: tutorForm.email_alias || null,
        })
        .eq("id", tutorForm.id),
    ]);

    if (profileRes.error || tutorRes.error) {
      setMessage(`Error: ${profileRes.error?.message || tutorRes.error?.message}`);
    } else {
      setMessage("Profile updated.");
      router.refresh();
    }
    setSaving(false);
  }

  // --- Pricing management ---

  function buildPriceMap(durations: number[], hourlyRate: number): Record<string, number> {
    const map: Record<string, number> = {};
    for (const d of durations) {
      map[String(d)] = Math.round((hourlyRate * d) / 60 * 100) / 100;
    }
    return map;
  }

  function toggleDuration(d: number) {
    setSelectedDurations((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  }

  async function savePricing() {
    if (!tutorId || selectedDurations.length === 0) return;
    setPricingSaving(true);
    setPricingMessage(null);

    const hourly = parseFloat(pricePerHour) || 0;
    const priceMap = buildPriceMap(selectedDurations, hourly);
    const supabase = createClient();

    // Update tutor-level pricing + locations
    const { error: tutorErr } = await supabase
      .from("tutors")
      .update({
        hourly_rate: hourly,
        session_durations: selectedDurations,
        locations,
      })
      .eq("id", tutorId);

    if (tutorErr) {
      setPricingMessage(`Error: ${tutorErr.message}`);
      setPricingSaving(false);
      return;
    }

    // Sync all tutor_subjects to use the new durations/prices
    if (tutorSubjects.length > 0) {
      const { error: syncErr } = await supabase
        .from("tutor_subjects")
        .update({
          durations: selectedDurations,
          prices: priceMap,
        })
        .eq("tutor_id", tutorId);

      if (syncErr) {
        setPricingMessage(`Error syncing subjects: ${syncErr.message}`);
        setPricingSaving(false);
        return;
      }
    }

    setPricingMessage("Pricing saved.");
    await loadData();
    setPricingSaving(false);
  }

  // --- Subject management ---

  function resetSubjectForm() {
    setShowSubjectForm(false);
    setEditingSubjectId(null);
    setSelectedSubjectId("");
    setSelectedAddCategory("");
    setSubjectCourses([]);
    setNewCourse("");
    setEditingCourseIndex(null);
    setEditingCourseValue("");
  }

  function startEditSubject(ts: TutorSubject) {
    setEditingSubjectId(ts.id);
    setSelectedSubjectId(ts.subject_id);
    setSubjectCourses([...ts.levels]);
    setShowSubjectForm(true);
  }

  function addCourse() {
    const trimmed = newCourse.trim();
    if (trimmed && !subjectCourses.includes(trimmed)) {
      setSubjectCourses([...subjectCourses, trimmed]);
      setNewCourse("");
    }
  }

  function removeCourse(index: number) {
    setSubjectCourses(subjectCourses.filter((_, i) => i !== index));
    if (editingCourseIndex === index) {
      setEditingCourseIndex(null);
      setEditingCourseValue("");
    }
  }

  function startEditCourse(index: number) {
    setEditingCourseIndex(index);
    setEditingCourseValue(subjectCourses[index]);
  }

  function commitEditCourse() {
    if (editingCourseIndex === null) return;
    const trimmed = editingCourseValue.trim();
    if (trimmed && trimmed !== subjectCourses[editingCourseIndex]) {
      if (!subjectCourses.includes(trimmed)) {
        setSubjectCourses(subjectCourses.map((c, i) => (i === editingCourseIndex ? trimmed : c)));
      }
    }
    setEditingCourseIndex(null);
    setEditingCourseValue("");
  }

  function cancelEditCourse() {
    setEditingCourseIndex(null);
    setEditingCourseValue("");
  }

  async function saveSubject() {
    if (!tutorId || !selectedSubjectId) return;
    setSubjectSaving(true);
    setSubjectMessage(null);

    const hourly = parseFloat(pricePerHour) || 0;
    const priceMap = buildPriceMap(selectedDurations, hourly);
    const supabase = createClient();

    if (editingSubjectId) {
      const { error } = await supabase
        .from("tutor_subjects")
        .update({ levels: subjectCourses })
        .eq("id", editingSubjectId);

      if (error) {
        setSubjectMessage(`Error: ${error.message}`);
      } else {
        setSubjectMessage("Subject updated.");
        resetSubjectForm();
        await loadData();
      }
    } else {
      const { error } = await supabase.from("tutor_subjects").insert({
        tutor_id: tutorId,
        subject_id: selectedSubjectId,
        levels: subjectCourses,
        durations: selectedDurations,
        prices: priceMap,
        format: "online",
        active: true,
      });

      if (error) {
        setSubjectMessage(`Error: ${error.message}`);
      } else {
        setSubjectMessage("Subject added.");
        resetSubjectForm();
        await loadData();
      }
    }
    setSubjectSaving(false);
  }

  async function removeSubject(id: string) {
    const supabase = createClient();
    await supabase.from("tutor_subjects").delete().eq("id", id);
    await loadData();
  }

  async function handleSubjectDragEnd(event: DragEndEvent, category: string) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const catSubjects = tutorSubjects.filter((ts) => (ts.subjects.category || "Uncategorized") === category);
    const oldIndex = catSubjects.findIndex((ts) => ts.id === active.id);
    const newIndex = catSubjects.findIndex((ts) => ts.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(catSubjects, oldIndex, newIndex);

    // Optimistic update: reassign sort_order within category
    setTutorSubjects((prev) => {
      const updated = [...prev];
      for (let i = 0; i < reordered.length; i++) {
        const target = updated.find((ts) => ts.id === reordered[i].id);
        if (target) target.sort_order = i;
      }
      return updated;
    });

    const supabase = createClient();
    await Promise.all(
      reordered.map((ts, idx) =>
        supabase.from("tutor_subjects").update({ sort_order: idx }).eq("id", ts.id)
      )
    );
  }

  async function toggleActive(ts: TutorSubject) {
    const supabase = createClient();
    await supabase
      .from("tutor_subjects")
      .update({ active: !ts.active })
      .eq("id", ts.id);
    await loadData();
  }

  // --- Calendar handlers ---

  function handleCellClick(day: number, timeIdx: number, shiftKey: boolean) {
    const last = lastClickedRef.current;
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (shiftKey && last) {
        const minDay = Math.min(last.day, day);
        const maxDay = Math.max(last.day, day);
        const minIdx = Math.min(last.timeIdx, timeIdx);
        const maxIdx = Math.max(last.timeIdx, timeIdx);
        for (let d = minDay; d <= maxDay; d++) {
          for (let t = minIdx; t <= maxIdx; t++) {
            next.add(calCellKey(d, TIME_SLOTS[t]));
          }
        }
      } else {
        const key = calCellKey(day, TIME_SLOTS[timeIdx]);
        if (next.has(key)) next.delete(key);
        else next.add(key);
      }
      return next;
    });
    lastClickedRef.current = { day, timeIdx };
    setHasAvailChanges(true);
  }

  async function saveAvailability() {
    if (!tutorId) return;
    setAvailSaving(true);
    setMessage(null);
    const supabase = createClient();
    await supabase.from("availability_rules").delete().eq("tutor_id", tutorId);
    const newRules = cellsToRules(selectedCells);
    if (newRules.length > 0) {
      const { error } = await supabase.from("availability_rules").insert(
        newRules.map((r) => ({
          tutor_id: tutorId,
          day_of_week: r.day_of_week,
          start_time: r.start_time,
          end_time: r.end_time,
          format: "online",
        }))
      );
      if (error) {
        setMessage(`Error: ${error.message}`);
        setAvailSaving(false);
        return;
      }
    }
    setMessage("Availability saved.");
    setHasAvailChanges(false);
    await loadData();
    setAvailSaving(false);
  }

  function handleTimeOffDateClick(dateStr: string, shiftKey: boolean) {
    setToSelectedDates((prev) => {
      const next = new Set(prev);
      if (shiftKey && toLastClicked) {
        const start = new Date(toLastClicked);
        const end = new Date(dateStr);
        const from = start < end ? start : end;
        const to = start < end ? end : start;
        const d = new Date(from);
        while (d <= to) {
          next.add(d.toISOString().slice(0, 10));
          d.setDate(d.getDate() + 1);
        }
      } else {
        if (next.has(dateStr)) next.delete(dateStr);
        else next.add(dateStr);
      }
      return next;
    });
    setToLastClicked(dateStr);
  }

  async function addTimeOff() {
    if (!tutorId || toSelectedDates.size === 0) return;
    setAvailSaving(true);
    setMessage(null);

    const sorted = Array.from(toSelectedDates).sort();
    // Group consecutive dates into ranges
    const ranges: Array<{ start: string; end: string }> = [];
    let rangeStart = sorted[0];
    let rangeEnd = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(rangeEnd);
      prev.setDate(prev.getDate() + 1);
      if (sorted[i] === prev.toISOString().slice(0, 10)) {
        rangeEnd = sorted[i];
      } else {
        ranges.push({ start: rangeStart, end: rangeEnd });
        rangeStart = sorted[i];
        rangeEnd = sorted[i];
      }
    }
    ranges.push({ start: rangeStart, end: rangeEnd });

    const supabase = createClient();
    const inserts = ranges.map((r) => ({
      tutor_id: tutorId,
      starts_at: new Date(r.start + "T00:00:00").toISOString(),
      ends_at: new Date(r.end + "T23:59:59").toISOString(),
      reason: toReason || null,
    }));

    const { error } = await supabase.from("time_off").insert(inserts);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage("Time off added.");
      setToSelectedDates(new Set());
      setToLastClicked(null);
      setToReason("");
      await loadData();
    }
    setAvailSaving(false);
  }

  async function deleteTimeOff(id: string) {
    const supabase = createClient();
    await supabase.from("time_off").delete().eq("id", id);
    await loadData();
  }

  if (loading) {
    return <p className="py-12 text-center text-muted-foreground">Loading...</p>;
  }

  const addedIds = new Set(tutorSubjects.map((ts) => ts.subject_id));
  const available = allSubjects.filter((s) => !addedIds.has(s.id) || s.id === selectedSubjectId);

  // Group tutor subjects by category
  const tutorSubjectsByCategory: Record<string, TutorSubject[]> = {};
  for (const ts of tutorSubjects) {
    const cat = ts.subjects.category || "Uncategorized";
    if (!tutorSubjectsByCategory[cat]) tutorSubjectsByCategory[cat] = [];
    tutorSubjectsByCategory[cat].push(ts);
  }

  // Available categories for the add form
  const availableCategories = [...new Set(available.map((s) => s.category || "Uncategorized"))].sort();
  const availableForCategory = selectedAddCategory
    ? available.filter((s) => (s.category || "Uncategorized") === selectedAddCategory)
    : [];

  // Course edit form used in both inline edit and add form
  const courseEditUI = (
    <div className="space-y-2">
      <Label>Courses / Types <span className="font-normal text-muted-foreground">(click to edit)</span></Label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {subjectCourses.map((course, i) =>
          editingCourseIndex === i ? (
            <Input
              key={i}
              autoFocus
              value={editingCourseValue}
              onChange={(e) => setEditingCourseValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitEditCourse(); }
                if (e.key === "Escape") cancelEditCourse();
              }}
              onBlur={commitEditCourse}
              className="w-40"
            />
          ) : (
            <Badge
              key={i}
              variant="secondary"
              className="gap-1 pr-1 cursor-pointer hover:bg-secondary/80"
            >
              <button
                type="button"
                onClick={() => startEditCourse(i)}
                className="hover:underline"
              >
                {course}
              </button>
              <button
                type="button"
                onClick={() => removeCourse(i)}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={newCourse}
          onChange={(e) => setNewCourse(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addCourse(); }
          }}
          placeholder="e.g., AP Calculus AB, Honors, Introductory"
          className="flex-1"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {!targetProfileId && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Edit Profile</h1>
            {userRole && (
              <Badge variant="secondary" className="capitalize">{userRole}</Badge>
            )}
          </div>
          {userRole !== "superadmin" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const path = tutorForm.slug || tutorId;
                if (path) window.open(`/tutor/${path}`, "_blank");
              }}
              disabled={!tutorId}
            >
              Preview public profile
            </Button>
          )}
        </div>
      )}

      {message && (
        <div
          className={`rounded-md p-3 text-sm ${
            message.startsWith("Error")
              ? "bg-destructive/10 text-destructive"
              : "bg-green-500/10 text-green-700"
          }`}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <CollapsibleCard title="Personal Info" defaultOpen>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label required>First name</Label>
                <Input
                  value={profileForm.first_name}
                  onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label required>Last name</Label>
                <Input
                  value={profileForm.last_name}
                  onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="404-333-5554"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone carrier</Label>
                <Select value={profileForm.phone_carrier} onValueChange={(v) => setProfileForm({ ...profileForm, phone_carrier: v ?? "" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select carrier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CARRIER_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Required for text notifications when lessons are booked.
                </p>
              </div>
            </div>
            {profileForm.phone && !profileForm.phone_carrier && (
              <div className="rounded-md border border-orange-400 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-600 dark:bg-orange-950 dark:text-orange-200">
                <strong>Text notifications disabled:</strong> Select your phone carrier above to receive SMS alerts when lessons are booked.
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => loadData()}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </CollapsibleCard>

        {userRole !== "superadmin" && (<>
        <CollapsibleCard
          title="Public Profile"
          description="This is shown to visitors and prospective clients."
        >
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Profile URL</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground whitespace-nowrap">/tutor/</span>
                <Input
                  value={tutorForm.slug}
                  onChange={(e) =>
                    setTutorForm({
                      ...tutorForm,
                      slug: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-")
                        .replace(/-+/g, "-")
                        .replace(/^-|-$/g, ""),
                    })
                  }
                  placeholder="david-kim"
                  className="flex-1"
                />
              </div>
              {tutorForm.slug && (
                <p className="text-xs text-muted-foreground">
                  Your public link: {typeof window !== "undefined" ? window.location.origin : ""}/tutor/{tutorForm.slug}
                </p>
              )}
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Education</Label>
              <Input
                value={tutorForm.education}
                onChange={(e) => setTutorForm({ ...tutorForm, education: e.target.value })}
                placeholder="e.g., University of Florida, B.S. Mathematics"
              />
            </div>
            <div className="space-y-2">
              <Label>Credentials</Label>
              <Input
                value={tutorForm.credentials}
                onChange={(e) => setTutorForm({ ...tutorForm, credentials: e.target.value })}
                placeholder="e.g., M.S. Mathematics, Certified Teacher"
              />
            </div>
            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea
                value={tutorForm.bio}
                onChange={(e) => setTutorForm({ ...tutorForm, bio: e.target.value })}
                rows={4}
                placeholder="Tell families about your teaching approach..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Years of experience</Label>
                <Input
                  type="number"
                  min="0"
                  value={tutorForm.years_experience}
                  onChange={(e) => setTutorForm({ ...tutorForm, years_experience: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Intro video URL</Label>
                <Input
                  type="url"
                  value={tutorForm.video_url}
                  onChange={(e) => setTutorForm({ ...tutorForm, video_url: e.target.value })}
                  placeholder="YouTube or Vimeo link"
                />
              </div>
            </div>
            {enabledPlatforms.length > 0 && (
              <div className="space-y-2">
                <Label>Meeting platform</Label>
                {enabledPlatforms.length === 2 ? (
                  <>
                    <div className="flex gap-2">
                      {[
                        { value: "google_meet", label: "Google Meet" },
                        { value: "zoom", label: "Zoom" },
                      ]
                        .filter((opt) => enabledPlatforms.includes(opt.value))
                        .map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setTutorForm({ ...tutorForm, meeting_platform: opt.value })}
                            className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                              tutorForm.meeting_platform === opt.value
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input hover:border-primary/50"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Choose your preferred meeting platform. A meeting link will be automatically generated and sent to you and your student when a lesson is booked.
                    </p>
                  </>
                ) : (
                  <p className="text-sm">
                    Your lessons will use{" "}
                    <span className="font-medium">
                      {enabledPlatforms[0] === "google_meet" ? "Google Meet" : "Zoom"}
                    </span>
                    . A meeting link will be automatically generated and sent to you and your student when a lesson is booked.
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Email alias</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={tutorForm.email_alias}
                  onChange={(e) => setTutorForm({ ...tutorForm, email_alias: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") })}
                  placeholder="jane"
                  className="max-w-[200px]"
                />
                <span className="text-sm text-muted-foreground">@{process.env.NEXT_PUBLIC_EMAIL_DOMAIN ?? "yourdomain.com"}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Notification emails to your clients will come from this address. Replies will forward to your personal email.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => loadData()}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </CollapsibleCard>

        {/* Session Location, Duration & Pricing */}
        <CollapsibleCard
          title="Session Location, Duration, and Pricing"
          description="Set your in-person locations, session lengths, and hourly rate."
        >
          <CardContent className="space-y-4">
            {pricingMessage && (
              <div
                className={`rounded-md p-3 text-sm ${
                  pricingMessage.startsWith("Error")
                    ? "bg-destructive/10 text-destructive"
                    : "bg-green-500/10 text-green-700"
                }`}
              >
                {pricingMessage}
              </div>
            )}

            {/* In-Person Locations */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={offersInPerson}
                  onChange={(e) => {
                    setOffersInPerson(e.target.checked);
                    if (!e.target.checked) {
                      setLocations([]);
                      setLocationInput("");
                      setSelectedPlace(null);
                      setLocationSuggestions([]);
                    }
                  }}
                  className="size-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium">I offer in-person tutoring</span>
              </label>

              {offersInPerson && (
                <div className="space-y-3 pl-6">
                  <p className="text-xs text-muted-foreground">
                    Add locations where you&apos;re available for in-person tutoring and how far you&apos;re willing to travel.
                  </p>

                  {locations.map((loc, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{loc.address}</p>
                        <p className="text-xs text-muted-foreground">Within {loc.radius_miles} miles</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeLocation(i)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}

                  <div className="space-y-2">
                    <div className="relative">
                      <Input
                        value={locationInput}
                        onChange={(e) => handleLocationSearch(e.target.value)}
                        placeholder="Search for an address..."
                      />
                      {locationSuggestions.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
                          {locationSuggestions.map((s) => (
                            <button
                              key={s.place_id}
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 border-b last:border-b-0"
                              onClick={() => selectSuggestion(s)}
                            >
                              {s.description}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedPlace && (
                      <div className="flex items-end gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Distance (miles)</Label>
                          <Input
                            type="number"
                            min="1"
                            max="100"
                            value={locationRadius}
                            onChange={(e) => setLocationRadius(e.target.value)}
                            className="w-24"
                          />
                        </div>
                        <Button type="button" size="sm" onClick={addLocation}>
                          Add Location
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Session Durations</Label>
              <div className="flex gap-4">
                {DURATION_OPTIONS.map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedDurations.includes(d)}
                      onChange={() => toggleDuration(d)}
                      className="size-4 rounded border-gray-300"
                    />
                    {d} min
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Price per hour</Label>
              <div className="relative w-40">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricePerHour}
                  onChange={(e) => setPricePerHour(e.target.value)}
                  placeholder="70"
                  className="pl-7"
                />
              </div>
              {pricePerHour && selectedDurations.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedDurations.map((d) => {
                    const price = Math.round((parseFloat(pricePerHour) * d) / 60 * 100) / 100;
                    return (
                      <span key={d} className="mr-3">
                        {d} min = <span className="font-bold">${price}</span>
                      </span>
                    );
                  })}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => loadData()}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={savePricing}
                disabled={pricingSaving || selectedDurations.length === 0}
              >
                {pricingSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </CollapsibleCard>

        {/* Subjects — grouped by category */}
        <CollapsibleCard
          title="Subjects"
          description="Manage the subjects you teach and their course types."
        >
          <CardContent className="space-y-4">
            {subjectMessage && (
              <div
                className={`rounded-md p-3 text-sm ${
                  subjectMessage.startsWith("Error")
                    ? "bg-destructive/10 text-destructive"
                    : "bg-green-500/10 text-green-700"
                }`}
              >
                {subjectMessage}
              </div>
            )}

            {tutorSubjects.length === 0 && !showSubjectForm && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No subjects added yet. Click &quot;Add Subject&quot; to get started.
              </p>
            )}

            {Object.keys(tutorSubjectsByCategory).length > 0 && (
              <div className="space-y-6">
                {Object.entries(tutorSubjectsByCategory)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([category, catSubjects]) => (
                    <div key={category}>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        {category}
                      </h3>
                      <DndContext
                        sensors={dndSensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleSubjectDragEnd(event, category)}
                      >
                        <SortableContext
                          items={catSubjects.map((ts) => ts.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-3">
                            {catSubjects.map((ts) => (
                              <SortableProfileSubject
                                key={ts.id}
                                ts={ts}
                                isEditing={editingSubjectId === ts.id}
                                courseEditUI={courseEditUI}
                                resetSubjectForm={resetSubjectForm}
                                saveSubject={saveSubject}
                                subjectSaving={subjectSaving}
                                startEditSubject={startEditSubject}
                                toggleActive={toggleActive}
                                removeSubject={removeSubject}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  ))}
              </div>
            )}

            {!showSubjectForm && !editingSubjectId && (
              <Button
                type="button"
                variant="outline"
                className="w-full bg-gray-200 text-gray-700 hover:bg-gray-300 border-gray-300"
                onClick={() => {
                  resetSubjectForm();
                  setShowSubjectForm(true);
                }}
              >
                <Plus className="mr-1 size-4" />
                Add Subject
              </Button>
            )}

            {/* Add new subject form */}
            {showSubjectForm && !editingSubjectId && (
                <div className="rounded-lg border-2 border-primary p-4 space-y-4">
                  <span className="text-sm font-semibold">Add New Subject</span>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label required>Category</Label>
                      <Select value={selectedAddCategory} onValueChange={(v) => { setSelectedAddCategory(v ?? ""); setSelectedSubjectId(""); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCategories.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label required>Subject</Label>
                      <Select value={selectedSubjectId} onValueChange={(v) => setSelectedSubjectId(v ?? "")} disabled={!selectedAddCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder={selectedAddCategory ? "Select a subject..." : "Select a category first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableForCategory.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {courseEditUI}

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={resetSubjectForm}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={saveSubject}
                      disabled={subjectSaving || !selectedSubjectId}
                      size="sm"
                    >
                      {subjectSaving ? "Saving..." : "Add"}
                    </Button>
                  </div>
                </div>
            )}
          </CardContent>
        </CollapsibleCard>

        {/* Calendar & Availability */}
        <CollapsibleCard title="Calendar Integration">
          <CardContent className="space-y-3">
            {calendarProvider === "none" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Connect your calendar to automatically sync lessons as events.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    window.location.href = "/api/calendar/google/connect";
                  }}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Connect Google Calendar
                </Button>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-green-500/10 text-green-700">
                    Connected
                  </Badge>
                  <span className="text-sm capitalize">{calendarProvider} Calendar</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={disconnecting}
                  onClick={async () => {
                    setDisconnecting(true);
                    const res = await fetch("/api/calendar/disconnect", { method: "POST" });
                    if (res.ok) {
                      setCalendarProvider("none");
                      setMessage("Calendar disconnected.");
                    } else {
                      setMessage("Error: Failed to disconnect calendar.");
                    }
                    setDisconnecting(false);
                  }}
                >
                  Disconnect
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleCard>

        <CollapsibleCard
          title="Weekly Availability"
          description={tutorTimeZone ? `Times shown in ${tutorTimeZone.replace(/_/g, " ")}` : undefined}
        >
          <CardContent>
            <div className="mb-3">
              <p className="text-xs text-muted-foreground">
                Click to toggle slots. Hold <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px] font-mono">Shift</kbd> + click to select a range.
              </p>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[500px]">
                <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-px">
                  <div />
                  {SHORT_DAYS.map((d) => (
                    <div key={d} className="py-2 text-center text-xs font-semibold">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-[60px_repeat(7,1fr)] rounded-lg overflow-hidden border">
                  {TIME_SLOTS.map((time, timeIdx) => (
                    <div key={time} className="contents">
                      <div className="flex items-center justify-end pr-2 bg-white text-[10px] text-muted-foreground h-5 border-b border-r">
                        {time.endsWith(":00") ? formatTimeAmPm(time) : ""}
                      </div>
                      {Array.from({ length: 7 }, (_, day) => {
                        const key = calCellKey(day, time);
                        const isSelected = selectedCells.has(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleCellClick(day, timeIdx, e.shiftKey);
                            }}
                            className={`h-5 border-b border-r transition-colors select-none ${
                              isSelected
                                ? "bg-blue-400 hover:bg-blue-500"
                                : "bg-white hover:bg-blue-100"
                            }`}
                            title={`${DAYS[day]} ${formatTimeAmPm(time)}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              {hasAvailChanges && (
                <span className="self-center text-xs text-muted-foreground mr-auto">Unsaved changes</span>
              )}
              <Button type="button" variant="outline" onClick={() => loadData()}>
                Cancel
              </Button>
              <Button type="button" onClick={saveAvailability} disabled={availSaving || !hasAvailChanges} className="bg-black text-white hover:bg-black/80">
                {availSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </CollapsibleCard>

        <CollapsibleCard title="Time Off">
          <CardContent className="space-y-4">
            {/* Existing time off entries */}
            {timeOffs.length > 0 && (
              <div className="space-y-2">
                {timeOffs.map((to) => (
                  <div key={to.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(to.starts_at).toLocaleDateString()} &ndash;{" "}
                        {new Date(to.ends_at).toLocaleDateString()}
                      </p>
                      {to.reason && (
                        <p className="text-xs text-muted-foreground">{to.reason}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteTimeOff(to.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <Separator />
              </div>
            )}

            {/* 12-month calendar */}
            <p className="text-xs text-muted-foreground">
              Click dates to select time off. Hold <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px] font-mono">Shift</kbd> + click to select a range.
            </p>
            <TimeOffCalendar
              selectedDates={toSelectedDates}
              existingTimeOffs={timeOffs}
              onDateClick={handleTimeOffDateClick}
            />

            {toSelectedDates.size > 0 && (
              <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
                <p className="text-sm">
                  <span className="font-medium">{toSelectedDates.size} date{toSelectedDates.size !== 1 ? "s" : ""}</span> selected
                </p>
                <div className="flex flex-1 items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Reason (optional)</Label>
                    <Input
                      value={toReason}
                      onChange={(e) => setToReason(e.target.value)}
                      placeholder="e.g., Vacation"
                      className="w-40"
                    />
                  </div>
                  <Button type="button" size="sm" onClick={addTimeOff} disabled={availSaving}>
                    {availSaving ? "Saving..." : "Add Time Off"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => { setToSelectedDates(new Set()); setToLastClicked(null); }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleCard>

        </>)}
      </form>
    </div>
  );
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function TimeOffCalendar({
  selectedDates,
  existingTimeOffs,
  onDateClick,
}: {
  selectedDates: Set<string>;
  existingTimeOffs: TimeOffEntry[];
  onDateClick: (dateStr: string, shiftKey: boolean) => void;
}) {
  const today = new Date();
  const year = today.getFullYear();
  const todayStr = today.toISOString().slice(0, 10);

  // Build set of existing time-off dates for highlighting
  const existingDates = new Set<string>();
  for (const to of existingTimeOffs) {
    const start = new Date(to.starts_at);
    const end = new Date(to.ends_at);
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (d <= endDate) {
      existingDates.add(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
  }

  const months = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {months.map((month) => {
        const firstDay = new Date(year, month, 1);
        const startDow = firstDay.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        return (
          <div key={month} className="space-y-1">
            <p className="text-xs font-semibold text-center">{MONTH_NAMES[month]} {year}</p>
            <div className="grid grid-cols-7 gap-px text-center">
              {WEEKDAY_HEADERS.map((d) => (
                <div key={d} className="text-[9px] text-muted-foreground font-medium py-0.5">{d}</div>
              ))}
              {Array.from({ length: startDow }, (_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isPast = dateStr < todayStr;
                const isExisting = existingDates.has(dateStr);
                const isSelected = selectedDates.has(dateStr);

                return (
                  <button
                    key={day}
                    type="button"
                    disabled={isPast}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!isPast) onDateClick(dateStr, e.shiftKey);
                    }}
                    className={`text-[10px] leading-none rounded py-1 transition-colors select-none ${
                      isPast
                        ? "text-muted-foreground/40 cursor-default"
                        : isSelected
                          ? "bg-primary text-primary-foreground font-bold"
                          : isExisting
                            ? "bg-destructive/20 text-destructive font-medium"
                            : dateStr === todayStr
                              ? "ring-1 ring-primary text-foreground hover:bg-primary/10"
                              : "text-foreground hover:bg-muted"
                    }`}
                    title={
                      isExisting
                        ? `Time off: ${dateStr}`
                        : isSelected
                          ? `Selected: ${dateStr}`
                          : dateStr
                    }
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TutorProfilePage() {
  return <TutorProfileContent />;
}
