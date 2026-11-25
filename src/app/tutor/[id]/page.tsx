import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { PublicShell } from "@/components/public-shell";
import { HowItWorks, type HowItWorksStep } from "@/components/how-it-works";


export default async function TutorPublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Support both UUID and slug
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const column = isUUID ? "id" : "slug";

  const { data: tutor } = await supabase
    .from("tutors")
    .select(`
      *,
      tutor_subjects(
        *,
        subjects(name, category)
      )
    `)
    .eq(column, id)
    .single();

  if (!tutor) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, time_zone")
    .eq("id", tutor.profile_id)
    .single();

  if (!profile) notFound();

  const subjects = (tutor.tutor_subjects as Array<{
    id: string;
    levels: string[];
    format: string;
    durations: number[];
    prices: Record<string, number>;
    active: boolean;
    subjects: { name: string; category: string };
  }>)?.filter((ts) => ts.active) || [];

  const subjectsByCategory = subjects.reduce<Record<string, typeof subjects>>((acc, ts) => {
    const cat = ts.subjects.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ts);
    return acc;
  }, {});

  // Load weekly availability
  const { data: availRules } = await supabase
    .from("availability_rules")
    .select("day_of_week, start_time, end_time")
    .eq("tutor_id", tutor.id)
    .order("day_of_week")
    .order("start_time");

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const scheduleByDay = new Map<number, { start: string; end: string }[]>();
  for (const rule of availRules ?? []) {
    const list = scheduleByDay.get(rule.day_of_week) ?? [];
    list.push({ start: rule.start_time, end: rule.end_time });
    scheduleByDay.set(rule.day_of_week, list);
  }

  function formatTime(t: string) {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  const policy = tutor.cancellation_policy as {
    full_refund_hours: number;
    partial_refund_pct: number;
    no_show_charge_pct: number;
  } | null;

  const allPrices = subjects.flatMap((ts) => Object.values(ts.prices));
  const lowestPrice = allPrices.length > 0 ? Math.min(...allPrices) : null;
  const hourlyPrices = subjects.map((ts) => ts.prices["60"]).filter(Boolean);
  const lowestHourly = hourlyPrices.length > 0 ? Math.min(...hourlyPrices) : lowestPrice;
  const firstName = profile.full_name.split(" ")[0];
  const initials = profile.full_name
    .split(" ")
    .map((n: string) => n[0])
    .join("");
  const bookUrl = `/book?tutor_id=${tutor.slug || tutor.id}`;

  // Load editable content from site_content (edited on home page)
  const { data: siteContentRows } = await supabase
    .from("site_content")
    .select("section_key, content")
    .in("section_key", ["howItWorks", "cancellationPolicy"]);

  const siteContent: Record<string, Record<string, unknown>> = {};
  for (const row of siteContentRows ?? []) {
    siteContent[row.section_key] = row.content as Record<string, unknown>;
  }

  const howItWorksRow = siteContent.howItWorks ? { content: siteContent.howItWorks } : null;

  // Cancellation policy labels (editable on home page)
  const cpContent = siteContent.cancellationPolicy ?? {};
  const cpTitle = (cpContent.title as string) || "Cancellation Policy";
  const cpFullRefundLabel = (cpContent.fullRefundLabel as string) || "Full refund";
  const cpPartialRefundLabel = (cpContent.partialRefundLabel as string) || "Partial refund";
  const cpNoShowLabel = (cpContent.noShowLabel as string) || "No-show charge";

  const howItWorksContent = howItWorksRow?.content as Record<string, unknown> | null;
  const howSteps: HowItWorksStep[] = (howItWorksContent?.steps as HowItWorksStep[]) || [
    { step: "01", title: "Choose a Subject", desc: "Pick from the available subjects and select a session length." },
    { step: "02", title: "Pick a Time", desc: "Browse available slots and choose one that works for you." },
    { step: "03", title: "Confirm & Pay", desc: "Secure your spot with a quick online checkout." },
    { step: "04", title: "Start Learning", desc: "Join the video call and get personalized instruction." },
  ];
  const howTheme = (howItWorksContent?.theme as string) || "fh-section-dark";
  const howLabel = (howItWorksContent?.label as string) || "Getting started";
  const howTitle = (howItWorksContent?.title as string) || "How It Works";

  return (
    <PublicShell>
        {/* ============================================================ */}
        {/* HERO — Profile + Book CTA                                    */}
        {/* ============================================================ */}
        <section className="bg-background border-b">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="flex flex-col sm:flex-row gap-8">
              {/* Left: avatar + stats */}
              <div className="flex flex-col items-center sm:items-start gap-4 sm:w-56 shrink-0">
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary/10 text-4xl font-bold text-primary">
                  {initials}
                </div>
                <div className="text-center sm:text-left">
                  <h1 className="text-2xl font-bold">{profile.full_name}</h1>
                  {tutor.years_experience && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {tutor.years_experience}+ years experience
                    </p>
                  )}
                  {lowestHourly != null && (
                    <p className="text-3xl font-bold mt-2">
                      ${lowestHourly}<span className="text-base font-normal text-muted-foreground">/hr</span>
                    </p>
                  )}
                </div>
                <Button size="md" className="w-full sm:w-auto" render={<Link href={bookUrl} />}>
                  Find a tutor
                </Button>
              </div>

              {/* Right: bio + details in label/content rows */}
              <div className="flex-1 min-w-0">
                {tutor.bio && (
                  <div className="flex gap-6 py-4 border-b">
                    <span className="w-28 shrink-0 text-sm font-medium text-muted-foreground pt-0.5">Bio</span>
                    <p className="text-sm leading-relaxed">{tutor.bio}</p>
                  </div>
                )}

                {tutor.education && (
                  <div className="flex gap-6 py-4 border-b">
                    <span className="w-28 shrink-0 text-sm font-medium text-muted-foreground">Education</span>
                    <p className="text-sm">{tutor.education}</p>
                  </div>
                )}

                {tutor.credentials && (
                  <div className="flex gap-6 py-4 border-b">
                    <span className="w-28 shrink-0 text-sm font-medium text-muted-foreground pt-0.5">Credentials</span>
                    <p className="text-sm">{tutor.credentials}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground pt-4">
                  {subjects.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <CheckCircle />
                      {subjects.length} subject{subjects.length !== 1 ? "s" : ""} offered
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <CheckCircle />
                    One-on-one lessons
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle />
                    100% online
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SUBJECTS & RATES                                             */}
        {/* ============================================================ */}
        {(subjects.length > 0 || scheduleByDay.size > 0 || policy) && (
          <section id="subjects" className="fh-section-dark">
            <div className="mx-auto max-w-6xl px-6 py-12">

              {/* Subjects — category label left, subjects right */}
              {subjects.length > 0 && (
                <div className="pb-8">
                  <h2 className="text-2xl font-bold text-white mb-2">Subjects</h2>
                  <div className="divide-y divide-white/10">
                    {Object.entries(subjectsByCategory).map(([category, catSubjects]) => (
                      <div key={category} className="flex gap-6 py-4">
                        <span className="w-28 shrink-0 text-sm font-medium text-gold-400 pt-0.5">{category}</span>
                        <div className="flex-1 flex flex-wrap gap-x-8 gap-y-1">
                          {catSubjects.map((ts) => (
                            <span key={ts.id} className="text-sm text-white">{ts.subjects.name}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Schedule — day label left, times right */}
              {scheduleByDay.size > 0 && (
                <div className="pt-8">
                  <h2 className="text-2xl font-bold text-white mb-2">Schedule</h2>
                  <div className="divide-y divide-white/10">
                    {DAYS.map((day, i) => {
                      const slots = scheduleByDay.get(i);
                      return (
                        <div key={day} className="flex gap-6 py-3">
                          <span className="w-28 shrink-0 text-sm font-medium text-gold-400">{day}</span>
                          {slots && slots.length > 0 ? (
                            <span className="text-sm text-white">
                              {slots.map((s, j) => (
                                <span key={j}>
                                  {j > 0 && ", "}
                                  {formatTime(s.start)} - {formatTime(s.end)}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="text-sm text-gold-100/40">Unavailable</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cancellation Policy — label left, details right */}
              {policy && (
                <div className="pt-8">
                  <h2 className="text-2xl font-bold text-white mb-2">{cpTitle}</h2>
                  <div className="divide-y divide-white/10">
                    <div className="flex gap-6 py-3">
                      <span className="w-28 shrink-0 text-sm font-medium text-gold-400">{cpFullRefundLabel}</span>
                      <span className="text-sm text-white">{policy.full_refund_hours}+ hours before the lesson</span>
                    </div>
                    <div className="flex gap-6 py-3">
                      <span className="w-28 shrink-0 text-sm font-medium text-gold-400">{cpPartialRefundLabel}</span>
                      <span className="text-sm text-white">{policy.partial_refund_pct}% refund under {policy.full_refund_hours} hours</span>
                    </div>
                    <div className="flex gap-6 py-3">
                      <span className="w-28 shrink-0 text-sm font-medium text-gold-400">{cpNoShowLabel}</span>
                      <span className="text-sm text-white">{policy.no_show_charge_pct}% of lesson fee charged</span>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* BOOK CTA (mid-page)                                          */}
        {/* ============================================================ */}
        <section className="bg-primary text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 text-center space-y-4">
            <h2 className="text-2xl font-bold sm:text-3xl">Ready to book a lesson with {firstName}?</h2>
            <p className="text-primary-foreground/80 max-w-xl mx-auto">
              Pick a subject, choose a time, and start learning. No commitments required.
            </p>
            <Button size="lg" className="bg-gold-400 text-navy-900 hover:bg-gold-300" render={<Link href={bookUrl} />}>
              Find a tutor
            </Button>
          </div>
        </section>

        {/* ============================================================ */}
        {/* HOW IT WORKS                                                 */}
        {/* ============================================================ */}
        <HowItWorks theme={howTheme} label={howLabel} title={howTitle} steps={howSteps} />

        {/* ============================================================ */}
        {/* FAQ (dynamic based on tutor data)                            */}
        {/* ============================================================ */}
        <section id="faq" className="fh-section-dark">
          <div className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="text-2xl font-bold text-center text-white">Frequently Asked Questions</h2>
          <div className="mt-8 space-y-4">
            <FaqItem
              question="How do online lessons work?"
              answer="All lessons take place over video call. After booking, you'll receive a meeting link. Just click to join at the scheduled time. All you need is a computer or tablet with internet access."
            />
            {subjects.length > 0 && (
              <FaqItem
                question={`What subjects does ${firstName} teach?`}
                answer={`${firstName} teaches ${subjects.map((s) => s.subjects.name).join(", ")}. Check the Subjects & Rates section above for levels and pricing.`}
              />
            )}
            {lowestPrice != null && (
              <FaqItem
                question="How much do lessons cost?"
                answer={`Rates start at $${lowestPrice} per session and vary by subject and duration. See the full pricing breakdown above.`}
              />
            )}
            {policy && (
              <FaqItem
                question="Can I reschedule or cancel a lesson?"
                answer={`Yes! Cancel or reschedule ${policy.full_refund_hours}+ hours before for a full refund. Late cancellations receive a ${policy.partial_refund_pct}% refund.`}
              />
            )}
            <FaqItem
              question="Do I need to commit to a set schedule?"
              answer="No commitment required. Book individual lessons whenever you need them. Many students start with weekly sessions, but you choose your own pace."
            />
          </div>
          </div>
        </section>

    </PublicShell>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group rounded-lg border border-white/10 bg-navy-800 px-6 py-4">
      <summary className="flex cursor-pointer items-center justify-between font-medium text-white">
        {question}
        <span className="ml-4 shrink-0 text-gold-100/60 transition-transform group-open:rotate-180">
          <ChevronDown />
        </span>
      </summary>
      <p className="mt-3 text-sm text-gold-100/60 leading-relaxed">
        {answer}
      </p>
    </details>
  );
}

function CheckCircle() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
