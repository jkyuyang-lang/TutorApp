import Link from "next/link";
import Image from "next/image";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppNav } from "@/components/app-nav";
import { EditableSection } from "@/components/editable-section";
import { getNextSlots, type AvailabilityRule, type TimeOff, type ExistingLesson, type BookingRules } from "@/lib/slots";
import type { FieldSchema } from "@/components/section-editor";
import { CancellationPolicy } from "@/components/cancellation-policy";
import { HowItWorks } from "@/components/how-it-works";
import { SubjectSearch } from "@/components/subject-search";
import { StickyNav } from "@/components/sticky-nav";

/* ------------------------------------------------------------------ */
/*  Section theme options                                              */
/* ------------------------------------------------------------------ */
const SECTION_THEMES = [
  { label: "Gold", value: "fh-section-gold" },
  { label: "Dark Navy", value: "fh-section-dark" },
  { label: "Sage", value: "fh-section-sage" },
  { label: "Cream", value: "fh-section-cream" },
  { label: "Coral", value: "fh-section-coral" },
];

/* ------------------------------------------------------------------ */
/*  Helper: merge DB content over defaults                             */
/* ------------------------------------------------------------------ */
function merge<T extends Record<string, unknown>>(defaults: T, overrides?: Record<string, unknown>): T {
  if (!overrides) return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in overrides && overrides[key] !== undefined && overrides[key] !== null && overrides[key] !== "") {
      (result as Record<string, unknown>)[key] = overrides[key];
    }
  }
  return result;
}

export default async function HomePage() {
  const supabase = createServiceClient();

  const { data: tutor } = await supabase
    .from("tutors")
    .select(`
      *,
      tutor_subjects(
        *,
        subjects(name, category)
      )
    `)
    .limit(1)
    .single();

  if (!tutor) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-12 text-center">
            <h1 className="text-xl font-semibold">Coming Soon</h1>
            <p className="mt-2 text-muted-foreground">
              This tutoring platform is being set up. Check back soon!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, time_zone")
    .eq("id", tutor.profile_id)
    .single();

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-12 text-center">
            <h1 className="text-xl font-semibold">Coming Soon</h1>
            <p className="mt-2 text-muted-foreground">
              This tutoring platform is being set up. Check back soon!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  const { data: availRules } = await supabase
    .from("availability_rules")
    .select("*")
    .eq("tutor_id", tutor.id);

  const { data: timeOffsData } = await supabase
    .from("time_off")
    .select("*")
    .eq("tutor_id", tutor.id)
    .gte("ends_at", new Date().toISOString());

  const { data: lessonsData } = await supabase
    .from("lessons")
    .select("starts_at, ends_at, status")
    .eq("tutor_id", tutor.id)
    .not("status", "in", '("canceled","late_cancel")')
    .gte("starts_at", new Date().toISOString());

  const nextSlots = getNextSlots(
    (availRules ?? []) as AvailabilityRule[],
    (timeOffsData ?? []) as TimeOff[],
    (lessonsData ?? []) as ExistingLesson[],
    {
      buffer_minutes: tutor.buffer_minutes,
      min_notice_hours: tutor.min_notice_hours,
      booking_window_days: tutor.booking_window_days,
      max_lessons_per_day: tutor.max_lessons_per_day,
    } as BookingRules,
    60,
    profile.time_zone || "America/New_York",
    10
  );

  const policy = tutor.cancellation_policy as {
    full_refund_hours: number;
    partial_refund_pct: number;
    no_show_charge_pct: number;
  };

  const allPrices = subjects.flatMap((ts) => Object.values(ts.prices));
  const lowestPrice = allPrices.length > 0 ? Math.min(...allPrices) : null;
  const firstName = profile.full_name.split(" ")[0];

  // Check auth & superadmin status
  const authSupabase = await createClient();
  const { data: { user: authUser } } = await authSupabase.auth.getUser();
  let authProfile: { id: string; role: string; full_name: string; avatar_url: string | null } | null = null;
  let isSuperAdmin = false;
  if (authUser) {
    const { data } = await authSupabase
      .from("profiles")
      .select("id, role, full_name, avatar_url")
      .eq("user_id", authUser.id)
      .single();
    authProfile = data;
    isSuperAdmin = data?.role === "superadmin";
  }

  // Load ALL subjects across all tutors for the Subjects & Rates section
  const { data: allTutorSubjects } = await supabase
    .from("tutor_subjects")
    .select("*, subjects(id, name, category, category_sort_order, sort_order)")
    .eq("active", true);

  // Build a map: subject_id → { name, category, levels (merged), lowestPrice, tutorCount, sort orders }
  const subjectMap = new Map<string, {
    id: string;
    name: string;
    category: string;
    categorySortOrder: number;
    sortOrder: number;
    levels: Set<string>;
    lowestPrice: number | null;
    tutorCount: number;
  }>();
  for (const ts of allTutorSubjects ?? []) {
    const subj = ts.subjects as { id: string; name: string; category: string; category_sort_order: number; sort_order: number };
    if (!subj) continue;
    let entry = subjectMap.get(subj.id);
    if (!entry) {
      entry = {
        id: subj.id,
        name: subj.name,
        category: subj.category || "Other",
        categorySortOrder: subj.category_sort_order ?? 0,
        sortOrder: subj.sort_order ?? 0,
        levels: new Set(),
        lowestPrice: null,
        tutorCount: 0,
      };
      subjectMap.set(subj.id, entry);
    }
    entry.tutorCount++;
    for (const l of (ts.levels as string[]) ?? []) entry.levels.add(l);
    const prices = Object.values(ts.prices as Record<string, number>);
    for (const p of prices) {
      if (entry.lowestPrice === null || p < entry.lowestPrice) entry.lowestPrice = p;
    }
  }

  // Group by category, sorted
  const allSubjectsList = Array.from(subjectMap.values()).sort(
    (a, b) => a.categorySortOrder - b.categorySortOrder || a.sortOrder - b.sortOrder
  );
  // Load editable content from DB
  const { data: siteContentRows } = await supabase
    .from("site_content")
    .select("section_key, content");

  const siteContent: Record<string, Record<string, unknown>> = {};
  for (const row of siteContentRows ?? []) {
    siteContent[row.section_key] = row.content as Record<string, unknown>;
  }

  /* ---------------------------------------------------------------- */
  /*  Section defaults & field schemas                                 */
  /* ---------------------------------------------------------------- */
  const heroDefaults = {
    label: "Private Tutoring",
    title: `Expert tutoring with ${firstName}`,
    subtitle: "Personalized one-on-one lessons designed to help you master challenging subjects, build confidence, and achieve your academic goals.",
    image: "/hero.jpg",
    primaryButtonText: "Find a tutor",
    secondaryButtonText: "Learn more",
  };
  const hero = merge(heroDefaults, siteContent.hero);
  const heroFields: FieldSchema[] = [
    { type: "image", label: "Background Image", key: "image" },
    { type: "text", label: "Label", key: "label" },
    { type: "text", label: "Title (use {firstName} for tutor name)", key: "title" },
    { type: "textarea", label: "Subtitle", key: "subtitle" },
    { type: "text", label: "Primary Button Text", key: "primaryButtonText" },
    { type: "text", label: "Secondary Button Text", key: "secondaryButtonText" },
  ];

  const welcomeDefaults = {
    theme: "fh-section-gold",
    image: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=960&q=80",
    label: "Welcome",
    title: "Personalized learning that gets results",
    subtitle: tutor.bio || `${firstName} provides expert one-on-one tutoring tailored to each student's unique needs. With a focus on building deep understanding and confidence, every session is designed to help you reach your full potential.`,
    buttonText: "Book your first session",
  };
  const welcome = merge(welcomeDefaults, siteContent.welcome);
  const welcomeFields: FieldSchema[] = [
    { type: "color", label: "Section Theme", key: "theme", options: SECTION_THEMES },
    { type: "image", label: "Image", key: "image" },
    { type: "text", label: "Label", key: "label" },
    { type: "text", label: "Title", key: "title" },
    { type: "textarea", label: "Description", key: "subtitle" },
    { type: "text", label: "Button Text", key: "buttonText" },
  ];

  const highlightsDefaults = {
    theme: "fh-section-cream",
    label: "Why choose us",
    title: "What makes our tutoring different",
    items: [
      {
        img: "https://images.unsplash.com/photo-1513258496099-48168024aec0?w=600&q=80",
        title: "Flexible Scheduling",
        desc: "Book lessons that fit your schedule. Available weekdays and weekends with easy online booking.",
      },
      {
        img: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=600&q=80",
        title: "Personalized Approach",
        desc: "Every student learns differently. Lessons are tailored to your pace, learning style, and goals.",
      },
      {
        img: "https://images.unsplash.com/photo-1471970394675-613138e45da3?w=600&q=80",
        title: "Track Your Progress",
        desc: "After each session, receive detailed notes on what was covered, homework, and next steps.",
      },
    ],
  };
  const highlights = merge(highlightsDefaults, siteContent.highlights);
  const highlightItems = (highlights.items as Array<{ img: string; title: string; desc: string }>);
  const highlightsFields: FieldSchema[] = [
    { type: "color", label: "Section Theme", key: "theme", options: SECTION_THEMES },
    { type: "text", label: "Label", key: "label" },
    { type: "text", label: "Title", key: "title" },
    {
      type: "list", label: "Cards", key: "items",
      itemFields: [
        { type: "image", label: "Image", key: "img" },
        { type: "text", label: "Title", key: "title" },
        { type: "textarea", label: "Description", key: "desc" },
      ],
    },
  ];

  const howItWorksDefaults = {
    theme: "fh-section-gold",
    label: "Getting started",
    title: "How It Works",
    steps: [
      { step: "01", title: "Choose a Subject", desc: "Pick from the available subjects and select a session length." },
      { step: "02", title: "Pick a Time", desc: "Browse available slots and choose one that works for you." },
      { step: "03", title: "Confirm & Pay", desc: "Secure your spot with a quick online checkout." },
      { step: "04", title: "Start Learning", desc: "Join the video call and get personalized instruction." },
    ],
  };
  const howItWorks = merge(howItWorksDefaults, siteContent.howItWorks);
  const howSteps = (howItWorks.steps as Array<{ step: string; title: string; desc: string }>);
  const howItWorksFields: FieldSchema[] = [
    { type: "color", label: "Section Theme", key: "theme", options: SECTION_THEMES },
    { type: "text", label: "Label", key: "label" },
    { type: "text", label: "Title", key: "title" },
    {
      type: "list", label: "Steps", key: "steps",
      itemFields: [
        { type: "text", label: "Step Number", key: "step" },
        { type: "text", label: "Title", key: "title" },
        { type: "textarea", label: "Description", key: "desc" },
      ],
    },
  ];

  const aboutDefaults = {
    image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1920&q=80",
    buttonText: "Get in touch",
  };
  const about = merge(aboutDefaults, siteContent.about);
  const aboutFields: FieldSchema[] = [
    { type: "image", label: "Background Image", key: "image" },
    { type: "text", label: "Button Text", key: "buttonText" },
  ];

  const contactDefaults = {
    theme: "fh-section-cream",
    label: "Contact",
    title: "Get in Touch",
    subtitle: `Have questions about tutoring, scheduling, or pricing? Reach out and ${firstName} will get back to you within 24 hours.`,
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&q=85",
    buttonText: "Fill out inquiry form",
    items: [
      { title: "Send an Inquiry", desc: "Fill out the form and get a personal response." },
      { title: "Direct Messaging", desc: `Sign up to message ${firstName} directly through the platform.` },
      { title: "Online Sessions", desc: "All lessons are held via video call. No commute needed." },
    ],
  };
  const contact = merge(contactDefaults, siteContent.contact);
  const contactItems = (contact.items as Array<{ title: string; desc: string }>);
  const contactFields: FieldSchema[] = [
    { type: "color", label: "Section Theme", key: "theme", options: SECTION_THEMES },
    { type: "image", label: "Image", key: "image" },
    { type: "text", label: "Label", key: "label" },
    { type: "text", label: "Title", key: "title" },
    { type: "textarea", label: "Description", key: "subtitle" },
    { type: "text", label: "Button Text", key: "buttonText" },
    {
      type: "list", label: "Items", key: "items",
      itemFields: [
        { type: "text", label: "Title", key: "title" },
        { type: "textarea", label: "Description", key: "desc" },
      ],
    },
  ];

  const faqDefaults = {
    theme: "fh-section-dark",
    label: "Support",
    title: "Frequently Asked Questions",
    items: [
      { question: "How do online lessons work?", answer: `All lessons take place over video call (Zoom). After booking, you'll receive a meeting link. Just click to join at the scheduled time. All you need is a computer or tablet with internet access.` },
      { question: "What subjects and levels do you teach?", answer: `${firstName} teaches ${subjects.map((s) => s.subjects.name).join(", ")}. Levels range from middle school through AP and college-level courses.` },
      { question: "How much do lessons cost?", answer: lowestPrice ? `Rates start at $${lowestPrice} per session and vary by subject and duration. See the Subjects section above for full pricing.` : "Pricing varies by subject and duration. See the Subjects section above for details." },
      { question: "Can I reschedule or cancel a lesson?", answer: policy ? `Yes! Cancel or reschedule ${policy.full_refund_hours}+ hours before for a full refund. Late cancellations receive a ${policy.partial_refund_pct}% refund.` : "Yes, you can reschedule or cancel through your account dashboard." },
      { question: "Do I need to commit to a set schedule?", answer: "No commitment or package required. Book individual lessons whenever you need them. Many students start with weekly sessions, but you can book as often as you like." },
      { question: "How do I track my child's progress?", answer: `After each lesson, ${firstName} publishes session notes covering what was discussed, homework assignments, and next steps.` },
      { question: "Is there a free trial or introductory session?", answer: `Contact ${firstName} directly through the inquiry form to ask about introductory rates or a consultation call before your first session.` },
    ],
  };
  const faq = merge(faqDefaults, siteContent.faq);
  const faqItems = (faq.items as Array<{ question: string; answer: string }>);
  const faqFields: FieldSchema[] = [
    { type: "color", label: "Section Theme", key: "theme", options: SECTION_THEMES },
    { type: "text", label: "Label", key: "label" },
    { type: "text", label: "Title", key: "title" },
    {
      type: "list", label: "Questions", key: "items",
      itemFields: [
        { type: "text", label: "Question", key: "question" },
        { type: "textarea", label: "Answer", key: "answer" },
      ],
    },
  ];

  const becomeTutorDefaults = {
    theme: "fh-section-dark",
    label: "Join our team",
    title: "Interested in Becoming a Tutor?",
    description: "Share your knowledge and make a real difference in students\u2019 lives. As a tutor on our platform, you\u2019ll enjoy flexible scheduling, competitive pay, and the satisfaction of helping others succeed.",
    buttonText: "Apply Now",
    perks: [
      { title: "Set Your Own Rates", desc: "You decide what to charge. Keep more of what you earn." },
      { title: "Flexible Schedule", desc: "Teach when it works for you. No minimum hours required." },
      { title: "Built-In Students", desc: "We handle marketing and bookings so you can focus on teaching." },
    ],
    stats: [
      { value: "100%", desc: "Online — teach from anywhere" },
      { value: "You Choose", desc: "Your subjects, rates & availability" },
      { value: "Zero Fees", desc: "No platform fees to get started" },
    ],
  };
  const becomeTutor = merge(becomeTutorDefaults, siteContent.becomeTutor);
  const becomeTutorPerks = becomeTutor.perks as Array<{ title: string; desc: string }>;
  const becomeTutorStats = becomeTutor.stats as Array<{ value: string; desc: string }>;
  const becomeTutorFields: FieldSchema[] = [
    { type: "color", label: "Section Theme", key: "theme", options: SECTION_THEMES },
    { type: "text", label: "Label", key: "label" },
    { type: "text", label: "Title", key: "title" },
    { type: "textarea", label: "Description", key: "description" },
    { type: "text", label: "Button Text", key: "buttonText" },
    {
      type: "list", label: "Perks", key: "perks",
      itemFields: [
        { type: "text", label: "Title", key: "title" },
        { type: "textarea", label: "Description", key: "desc" },
      ],
    },
    {
      type: "list", label: "Stats", key: "stats",
      itemFields: [
        { type: "text", label: "Value", key: "value" },
        { type: "textarea", label: "Description", key: "desc" },
      ],
    },
  ];

  const cancellationPolicyDefaults = {
    label: "Policies",
    title: "Cancellation Policy",
    subtitle: "Life happens. Here\u2019s how cancellations and refunds work:",
    fullRefundLabel: "Full refund",
    partialRefundLabel: "Partial refund",
    noShowLabel: "No-show charge",
  };
  const cancellationPolicyContent = merge(cancellationPolicyDefaults, siteContent.cancellationPolicy);
  const cancellationPolicyFields: FieldSchema[] = [
    { type: "text", label: "Label", key: "label" },
    { type: "text", label: "Title", key: "title" },
    { type: "textarea", label: "Subtitle", key: "subtitle" },
    { type: "text", label: "Full Refund Label", key: "fullRefundLabel" },
    { type: "text", label: "Partial Refund Label", key: "partialRefundLabel" },
    { type: "text", label: "No-Show Label", key: "noShowLabel" },
  ];

  const ctaDefaults = {
    image: "https://images.unsplash.com/photo-1529390079861-591de354faf5?w=1920&q=80",
    title: "Ready to get started?",
    subtitle: "Join students who are building confidence and achieving their goals with personalized one-on-one tutoring.",
    primaryButtonText: "Create free account",
    secondaryButtonText: "Ask a question first",
  };
  const cta = merge(ctaDefaults, siteContent.cta);
  const ctaFields: FieldSchema[] = [
    { type: "image", label: "Background Image", key: "image" },
    { type: "text", label: "Title", key: "title" },
    { type: "textarea", label: "Subtitle", key: "subtitle" },
    { type: "text", label: "Primary Button Text", key: "primaryButtonText" },
    { type: "text", label: "Secondary Button Text", key: "secondaryButtonText" },
  ];

  const footerDefaults = {
    tagline: "Personalized one-on-one tutoring to help students build confidence and achieve their academic goals.",
  };
  const footer = merge(footerDefaults, siteContent.footer);
  const footerFields: FieldSchema[] = [
    { type: "textarea", label: "Tagline", key: "tagline" },
  ];

  // Resolve template vars in hero title
  const heroTitle = (hero.title as string).replace("{firstName}", firstName);

  return (
    <div className="min-h-screen">
      {/* ============================================================ */}
      {/* HERO                                                         */}
      {/* ============================================================ */}
      {authUser && authProfile ? (
        <div className="fixed top-0 left-0 right-0 z-50">
          <AppNav user={authUser} profile={authProfile} transparent />
        </div>
      ) : (
        <StickyNav>
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <span className="text-lg font-bold text-white tracking-tight">TutorApp</span>
            <nav className="hidden items-center gap-8 sm:flex">
              <a href="#hero-search" className="text-sm text-white/70 hover:text-white transition-colors">Find a Tutor</a>
              <a href="#faq" className="text-sm text-white/70 hover:text-white transition-colors">How Lessons Work</a>
              <a href="#faq" className="text-sm text-white/70 hover:text-white transition-colors">FAQs</a>
              <a href="#become-tutor" className="text-sm text-white/70 hover:text-white transition-colors">Become a Tutor</a>
              <a href="#about" className="text-sm text-white/70 hover:text-white transition-colors">About Us</a>
            </nav>
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-sm text-white/80 hover:text-white transition-colors">Log in</Link>
              <Button size="sm" className="bg-gold-400 text-navy-900 hover:bg-gold-300 font-semibold" render={<Link href="/signup" />}>Sign up</Button>
            </div>
          </div>
        </StickyNav>
      )}

      <EditableSection isSuperAdmin={isSuperAdmin} sectionKey="hero" fields={heroFields} content={hero}>
        <section className="relative h-[85vh] min-h-[600px] overflow-visible">
          <Image
            src={hero.image as string}
            alt="Hero background"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />

          <div className="relative z-10 flex h-full items-center">
            <div className="mx-auto w-full max-w-6xl px-6">
              <div className="max-w-2xl space-y-6">
                <p id="hero-search" className="scroll-mt-20 fh-label text-gold-300">{hero.label as string}</p>
                <h1 className="text-5xl font-bold leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-7xl">
                  {heroTitle}
                </h1>
                <p className="text-lg leading-relaxed text-white/80 max-w-xl">{hero.subtitle as string}</p>
                <div>
                  <SubjectSearch
                    subjects={allSubjectsList.map((s) => ({ id: s.id, name: s.name, category: s.category }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </EditableSection>

      {/* ============================================================ */}
      {/* WELCOME                                                      */}
      {/* ============================================================ */}
      <EditableSection isSuperAdmin={isSuperAdmin} sectionKey="welcome" fields={welcomeFields} content={welcome}>
        <section className={welcome.theme as string}>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-0 overflow-hidden rounded-2xl shadow-2xl md:grid-cols-2">
              <div className="relative h-72 md:h-auto md:min-h-[400px]">
                <Image src={welcome.image as string} alt="Welcome" fill className="object-cover" />
              </div>
              <div className="bg-navy-900 p-10 md:p-14 flex flex-col justify-center">
                <p className="fh-label text-gold-300 mb-4">{welcome.label as string}</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl leading-tight">{welcome.title as string}</h2>
                <p className="mt-4 text-gold-100/80 leading-relaxed">{welcome.subtitle as string}</p>
                {tutor.credentials && <p className="mt-3 text-sm text-gold-200/60">{tutor.credentials}</p>}
                <div className="mt-8">
                  <Button className="bg-gold-400 text-navy-900 hover:bg-gold-300 font-semibold" render={<Link href={`/book?tutor_id=${tutor.id}`} />}>
                    {welcome.buttonText as string}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </EditableSection>

      {/* ============================================================ */}
      {/* HIGHLIGHTS                                                   */}
      {/* ============================================================ */}
      <EditableSection isSuperAdmin={isSuperAdmin} sectionKey="highlights" fields={highlightsFields} content={highlights}>
        <section className={highlights.theme as string}>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="fh-label text-navy-500 mb-3">{highlights.label as string}</p>
            <h2 className="text-3xl font-bold sm:text-4xl">{highlights.title as string}</h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {highlightItems.map((item) => (
                <div key={item.title} className="group overflow-hidden rounded-xl shadow-md">
                  <div className="relative h-48 overflow-hidden">
                    <Image src={item.img} alt={item.title} fill className="object-cover transition-transform duration-500 group-hover:scale-105" />
                  </div>
                  <div className="bg-white p-6 space-y-2">
                    <h3 className="font-bold text-lg">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </EditableSection>

      {/* ============================================================ */}
      {/* BECOME A TUTOR                                               */}
      {/* ============================================================ */}
      <EditableSection isSuperAdmin={isSuperAdmin} sectionKey="becomeTutor" fields={becomeTutorFields} content={becomeTutor}>
        <section id="become-tutor" className={becomeTutor.theme as string}>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-12 md:grid-cols-2 items-center">
              <div className="space-y-6">
                <p className="fh-label text-gold-300 mb-3">{becomeTutor.label as string}</p>
                <h2 className="text-3xl font-bold text-white sm:text-4xl">{becomeTutor.title as string}</h2>
                <p className="text-gold-100/70 leading-relaxed">
                  {becomeTutor.description as string}
                </p>
                <div className="space-y-4 pt-2">
                  {becomeTutorPerks.map((perk, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-400/15">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold-300"><path d="m9 11 3 3L22 4"/><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/></svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{perk.title}</p>
                        <p className="text-sm text-gold-100/50">{perk.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-4">
                  <Button size="lg" className="bg-gold-400 text-navy-900 hover:bg-gold-300 px-8" render={<Link href="/apply" />}>
                    {becomeTutor.buttonText as string}
                  </Button>
                </div>
              </div>
              <div className="hidden md:flex justify-center">
                <div className="rounded-2xl bg-navy-800 ring-1 ring-white/10 p-10 space-y-6 max-w-sm">
                  {becomeTutorStats.map((stat, i) => (
                    <div key={i}>
                      {i > 0 && <div className="border-t border-white/10 mb-6" />}
                      <div className="text-center space-y-2">
                        <p className="text-4xl font-bold text-gold-300">{stat.value}</p>
                        <p className="text-sm text-gold-100/60">{stat.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </EditableSection>

      {/* ============================================================ */}
      {/* HOW IT WORKS                                                 */}
      {/* ============================================================ */}
      <EditableSection isSuperAdmin={isSuperAdmin} sectionKey="howItWorks" fields={howItWorksFields} content={howItWorks}>
        <HowItWorks
          theme={howItWorks.theme as string}
          label={howItWorks.label as string}
          title={howItWorks.title as string}
          steps={howSteps}
        />
      </EditableSection>

      {/* ============================================================ */}
      {/* ABOUT                                                        */}
      {/* ============================================================ */}
      <EditableSection isSuperAdmin={isSuperAdmin} sectionKey="about" fields={aboutFields} content={about}>
        <section id="about" className="relative h-[50vh] min-h-[400px] overflow-hidden">
          <Image src={about.image as string} alt="About" fill className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-navy-900/90 via-navy-900/70 to-transparent" />
          <div className="relative z-10 flex h-full items-end">
            <div className="mx-auto w-full max-w-6xl px-6 pb-12">
              <p className="text-sm text-gold-300/80 mb-1">
                {tutor.years_experience ? `${tutor.years_experience}+ years of experience` : "Experienced educator"}
              </p>
              <h2 className="text-4xl font-bold text-white sm:text-5xl tracking-tight">About {firstName}</h2>
              {tutor.credentials && <p className="mt-2 text-gold-100/60 max-w-lg">{tutor.credentials}</p>}
              <div className="mt-4">
                <Button className="bg-gold-400 text-navy-900 hover:bg-gold-300 font-semibold" render={<a href="#contact" />}>
                  {about.buttonText as string}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </EditableSection>

      {/* ============================================================ */}
      {/* AVAILABILITY                                                 */}
      {/* ============================================================ */}
      {nextSlots.length > 0 && (
        <section id="availability" className="fh-section-sage">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="fh-label text-navy-700 mb-3">Schedule</p>
            <h2 className="text-3xl font-bold sm:text-4xl">Next Available Slots</h2>
            <p className="mt-2 text-navy-600">Here are the next open times. Sign up to see the full calendar and book.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {nextSlots.map((slot, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-black/5">
                  <span className="text-sm font-medium">
                    {slot.starts_at.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  <span className="text-sm font-bold">
                    {slot.starts_at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    {" "}&ndash;{" "}
                    {slot.ends_at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-8">
              <Button className="bg-navy-900 text-gold-300 hover:bg-navy-800 font-semibold" render={<Link href="/signup" />}>
                Sign up to book a slot
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* CONTACT                                                      */}
      {/* ============================================================ */}
      <EditableSection isSuperAdmin={isSuperAdmin} sectionKey="contact" fields={contactFields} content={contact}>
        <section id="contact" className={contact.theme as string}>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-10 md:grid-cols-2 items-center">
              <div className="space-y-6">
                <div>
                  <p className="fh-label text-navy-500 mb-3">{contact.label as string}</p>
                  <h2 className="text-3xl font-bold sm:text-4xl">{contact.title as string}</h2>
                  <p className="mt-3 text-muted-foreground leading-relaxed">{contact.subtitle as string}</p>
                </div>
                <div className="space-y-4">
                  {contactItems.map((item) => (
                    <div key={item.title} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-900">
                        <CheckMark />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{item.title}</p>
                        <p className="text-sm text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Button className="font-semibold" render={<Link href="/inquiry" />}>{contact.buttonText as string}</Button>
              </div>
              <div className="relative h-80 md:h-full md:min-h-[400px] overflow-hidden rounded-2xl">
                <Image src={contact.image as string} alt="Contact" fill className="object-cover" />
              </div>
            </div>
          </div>
        </section>
      </EditableSection>

      {/* ============================================================ */}
      {/* CANCELLATION POLICY                                          */}
      {/* ============================================================ */}
      {policy && (
        <EditableSection isSuperAdmin={isSuperAdmin} sectionKey="cancellationPolicy" fields={cancellationPolicyFields} content={cancellationPolicyContent}>
          <CancellationPolicy
            policy={policy}
            label={cancellationPolicyContent.label as string}
            title={cancellationPolicyContent.title as string}
            subtitle={cancellationPolicyContent.subtitle as string}
            fullRefundLabel={cancellationPolicyContent.fullRefundLabel as string}
            partialRefundLabel={cancellationPolicyContent.partialRefundLabel as string}
            noShowLabel={cancellationPolicyContent.noShowLabel as string}
          />
        </EditableSection>
      )}

      {/* ============================================================ */}
      {/* FAQ                                                          */}
      {/* ============================================================ */}
      <EditableSection isSuperAdmin={isSuperAdmin} sectionKey="faq" fields={faqFields} content={faq}>
        <section id="faq" className={faq.theme as string}>
          <div className="mx-auto max-w-3xl px-6 py-20">
            <div className="text-center mb-12">
              <p className="fh-label text-gold-300 mb-3">{faq.label as string}</p>
              <h2 className="text-3xl font-bold text-white sm:text-4xl">{faq.title as string}</h2>
            </div>
            <div className="space-y-4">
              {faqItems.map((item, i) => (
                <FaqItem key={i} question={item.question} answer={item.answer} />
              ))}
            </div>
          </div>
        </section>
      </EditableSection>

      {/* ============================================================ */}
      {/* CTA                                                          */}
      {/* ============================================================ */}
      <EditableSection isSuperAdmin={isSuperAdmin} sectionKey="cta" fields={ctaFields} content={cta}>
        <section className="relative h-[45vh] min-h-[350px] overflow-hidden">
          <Image src={cta.image as string} alt="CTA background" fill className="object-cover" />
          <div className="absolute inset-0 bg-navy-900/80" />
          <div className="relative z-10 flex h-full items-center justify-center text-center">
            <div className="max-w-2xl px-6 space-y-6">
              <h2 className="text-4xl font-bold text-white sm:text-5xl tracking-tight">{cta.title as string}</h2>
              <p className="text-lg text-gold-100/80">{cta.subtitle as string}</p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button size="lg" className="bg-gold-400 text-navy-900 hover:bg-gold-300 px-8" render={<Link href="/signup" />}>
                  {cta.primaryButtonText as string}
                </Button>
                <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 px-8" render={<Link href="/inquiry" />}>
                  {cta.secondaryButtonText as string}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </EditableSection>

      {/* ============================================================ */}
      {/* FOOTER                                                       */}
      {/* ============================================================ */}
      <EditableSection isSuperAdmin={isSuperAdmin} sectionKey="footer" fields={footerFields} content={footer}>
        <footer className="bg-navy-900 text-gold-100">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid gap-10 sm:grid-cols-3">
              <div>
                <span className="text-lg font-bold text-white">{profile.full_name} Tutoring</span>
                <p className="mt-3 text-sm text-gold-100/50 leading-relaxed">{footer.tagline as string}</p>
              </div>
              <div>
                <p className="fh-label text-gold-400 mb-4">Navigate</p>
                <div className="space-y-2 text-sm">
                  <a href="#hero-search" className="block text-gold-100/60 hover:text-white transition-colors">Find a Tutor</a>
                  <a href="#faq" className="block text-gold-100/60 hover:text-white transition-colors">How Lessons Work</a>
                  <a href="#faq" className="block text-gold-100/60 hover:text-white transition-colors">FAQs</a>
                  <a href="#become-tutor" className="block text-gold-100/60 hover:text-white transition-colors">Become a Tutor</a>
                  <a href="#about" className="block text-gold-100/60 hover:text-white transition-colors">About Us</a>
                </div>
              </div>
              <div>
                <p className="fh-label text-gold-400 mb-4">Get started</p>
                <div className="space-y-2 text-sm">
                  <Link href="/signup" className="block text-gold-100/60 hover:text-white transition-colors">Create account</Link>
                  <Link href="/login" className="block text-gold-100/60 hover:text-white transition-colors">Log in</Link>
                  <Link href="/inquiry" className="block text-gold-100/60 hover:text-white transition-colors">Send inquiry</Link>
                </div>
              </div>
            </div>
            <div className="mt-12 border-t border-white/10 pt-8 text-center text-xs text-gold-100/40">
              &copy; {new Date().getFullYear()} {profile.full_name} Tutoring. All rights reserved.
            </div>
          </div>
        </footer>
      </EditableSection>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group rounded-xl bg-navy-800 ring-1 ring-white/10 px-6 py-4">
      <summary className="flex cursor-pointer items-center justify-between font-medium text-white">
        {question}
        <span className="ml-4 shrink-0 text-gold-300/60 transition-transform group-open:rotate-180">
          <ChevronDown />
        </span>
      </summary>
      <p className="mt-3 text-sm text-gold-100/60 leading-relaxed">{answer}</p>
    </details>
  );
}

function CheckMark() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-gold-300">
      <path d="m5 12 5 5L20 7" />
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
