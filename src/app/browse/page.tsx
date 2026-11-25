import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { PublicShell } from "@/components/public-shell";

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject: subjectId } = await searchParams;
  if (!subjectId) notFound();

  const supabase = createServiceClient();

  // Fetch the subject
  const { data: subject } = await supabase
    .from("subjects")
    .select("id, name, category")
    .eq("id", subjectId)
    .single();

  if (!subject) notFound();

  // Fetch all tutors who teach this subject (active only)
  const { data: tutorSubjects } = await supabase
    .from("tutor_subjects")
    .select(`
      id,
      tutor_id,
      levels,
      format,
      durations,
      prices,
      tutors(
        id,
        slug,
        bio,
        education,
        credentials,
        years_experience,
        profile_id
      )
    `)
    .eq("subject_id", subjectId)
    .eq("active", true);

  const tsSelect = `
    id, tutor_id, levels, format, durations, prices,
    tutors(id, slug, bio, education, credentials, years_experience, profile_id)
  `;

  let activeTutorSubjects = tutorSubjects ?? [];
  let fallbackMessage: string | null = null;

  if (activeTutorSubjects.length === 0) {
    // Try tutors in the same category
    const { data: sameCategorySubjects } = await supabase
      .from("subjects")
      .select("id, name")
      .eq("category", subject.category)
      .neq("id", subjectId);

    for (const altSubject of sameCategorySubjects ?? []) {
      const { data: altTs } = await supabase
        .from("tutor_subjects")
        .select(tsSelect)
        .eq("subject_id", altSubject.id)
        .eq("active", true)
        .limit(3);
      if (altTs && altTs.length > 0) {
        activeTutorSubjects = altTs;
        fallbackMessage = `No tutors currently teach ${subject.name}. Here are tutors who teach ${altSubject.name}:`;
        break;
      }
    }

    // If still nothing, grab any active tutor
    if (activeTutorSubjects.length === 0) {
      const { data: anyTs } = await supabase
        .from("tutor_subjects")
        .select(tsSelect)
        .eq("active", true)
        .limit(3);
      if (anyTs && anyTs.length > 0) {
        activeTutorSubjects = anyTs;
        fallbackMessage = `No tutors currently teach ${subject.name}. Here are other available tutors:`;
      }
    }

    if (activeTutorSubjects.length === 0) {
      return (
        <BrowseShell subjectName={subject.name} category={subject.category}>
          <div className="text-center py-16">
            <p className="text-muted-foreground">No tutors are currently available.</p>
            <Button className="mt-4" render={<Link href="/#subjects" />}>
              Browse other subjects
            </Button>
          </div>
        </BrowseShell>
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyRow = Record<string, any>;

  // Fetch profiles for all tutors
  const profileIds = activeTutorSubjects
    .map((ts) => ((ts as AnyRow).tutors as AnyRow)?.profile_id as string)
    .filter(Boolean);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", profileIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );

  // For each tutor, also fetch ALL their active subjects to display
  const tutorIds = activeTutorSubjects
    .map((ts) => ((ts as AnyRow).tutors as AnyRow)?.id as string)
    .filter(Boolean);

  const { data: allTutorSubjects } = await supabase
    .from("tutor_subjects")
    .select("tutor_id, subjects(name, category)")
    .eq("active", true)
    .in("tutor_id", tutorIds);

  const tutorAllSubjects = new Map<string, string[]>();
  for (const ts of allTutorSubjects ?? []) {
    const subj = (ts as AnyRow).subjects as { name: string; category: string } | null;
    if (!subj) continue;
    const list = tutorAllSubjects.get(ts.tutor_id) ?? [];
    list.push(subj.name);
    tutorAllSubjects.set(ts.tutor_id, list);
  }

  // Build tutor cards data
  const tutors = activeTutorSubjects.map((ts) => {
    const tutor = (ts as AnyRow).tutors as {
      id: string;
      slug: string | null;
      bio: string | null;
      education: string | null;
      credentials: string | null;
      years_experience: number | null;
      profile_id: string;
    };
    const profile = profileMap.get(tutor.profile_id);
    const prices = ts.prices as Record<string, number>;
    const durations = ts.durations as number[];
    const levels = ts.levels as string[];

    return {
      tutorSubjectId: ts.id,
      tutorId: tutor.id,
      slug: tutor.slug,
      bio: tutor.bio,
      education: tutor.education,
      credentials: tutor.credentials,
      yearsExperience: tutor.years_experience,
      fullName: profile?.full_name ?? "Tutor",
      avatarUrl: profile?.avatar_url,
      levels,
      format: ts.format as string,
      durations,
      prices,
      allSubjects: tutorAllSubjects.get(tutor.id) ?? [],
    };
  });

  return (
    <BrowseShell subjectName={subject.name} category={subject.category}>
      <div className="space-y-6">
        {tutors.map((t) => {
          const firstName = t.fullName.split(" ")[0];
          const initials = t.fullName
            .split(" ")
            .map((n: string) => n[0])
            .join("");
          // Find the hourly (60 min) price, fall back to lowest price
          const hourlyPrice = t.prices["60"] ?? null;

          return (
            <Card key={t.tutorId} className="overflow-hidden">
              <CardContent className="p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row gap-6">
                  {/* Avatar + name + price */}
                  <div className="flex flex-col items-center sm:items-start gap-3 sm:w-48 shrink-0">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                      {initials}
                    </div>
                    <div className="text-center sm:text-left">
                      <h3 className="text-lg font-bold">{t.fullName}</h3>
                      {t.yearsExperience && (
                        <p className="text-xs text-muted-foreground">
                          {t.yearsExperience}+ years experience
                        </p>
                      )}
                      {hourlyPrice != null && (
                        <p className="text-3xl font-bold mt-1">
                          ${hourlyPrice}<span className="text-base font-normal text-muted-foreground">/hr</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    {/* Bio */}
                    {t.bio && (
                      <div className="flex gap-6 py-3 border-b">
                        <span className="w-28 shrink-0 text-sm font-medium text-muted-foreground pt-0.5">Bio</span>
                        <p className="text-sm leading-relaxed line-clamp-3">{t.bio}</p>
                      </div>
                    )}

                    {/* Education */}
                    {t.education && (
                      <div className="flex gap-6 py-3 border-b">
                        <span className="w-28 shrink-0 text-sm font-medium text-muted-foreground">Education</span>
                        <p className="text-sm">{t.education}</p>
                      </div>
                    )}

                    {/* Credentials */}
                    {t.credentials && (
                      <div className="flex gap-6 py-3 border-b">
                        <span className="w-28 shrink-0 text-sm font-medium text-muted-foreground pt-0.5">Credentials</span>
                        <p className="text-sm">{t.credentials}</p>
                      </div>
                    )}

                    {/* Levels */}
                    {t.levels.length > 0 && (
                      <div className="flex gap-6 py-3 border-b">
                        <span className="w-28 shrink-0 text-sm font-medium text-muted-foreground">Levels</span>
                        <p className="text-sm">{t.levels.join(", ")}</p>
                      </div>
                    )}

                    {/* Also teaches */}
                    {t.allSubjects.filter((s) => s !== subject.name).length > 0 && (
                      <div className="flex gap-6 py-3 border-b">
                        <span className="w-28 shrink-0 text-sm font-medium text-muted-foreground">Also teaches</span>
                        <p className="text-sm">{t.allSubjects.filter((s) => s !== subject.name).join(", ")}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-3 pt-4">
                      <Button render={<Link href={`/book?tutor_id=${t.slug || t.tutorId}`} />}>
                        Find a Tutor
                      </Button>
                      <Button
                        variant="outline"
                        render={<Link href={`/tutor/${t.slug || t.tutorId}`} />}
                      >
                        View Profile
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </BrowseShell>
  );
}

function BrowseShell({
  subjectName,
  category,
  children,
}: {
  subjectName: string;
  category: string;
  children: React.ReactNode;
}) {
  return (
    <PublicShell>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/#subjects" className="hover:text-foreground transition-colors">Subjects</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{subjectName}</span>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">
            {category}
          </p>
          <h1 className="text-3xl font-bold">{subjectName}</h1>
          <p className="mt-2 text-muted-foreground">
            Find a tutor for {subjectName} and book a one-on-one lesson.
          </p>
        </div>

        {children}
      </div>
    </PublicShell>
  );
}
