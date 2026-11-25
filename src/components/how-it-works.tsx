export interface HowItWorksStep {
  step: string;
  title: string;
  desc: string;
}

export interface HowItWorksProps {
  theme?: string;
  label?: string;
  title?: string;
  steps: HowItWorksStep[];
}

export function HowItWorks({
  theme = "fh-section-gold",
  label = "Getting started",
  title = "How It Works",
  steps,
}: HowItWorksProps) {
  return (
    <section className={theme}>
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-14">
          <p className="fh-label text-navy-600 mb-3">{label}</p>
          <h2 className="text-3xl font-bold sm:text-4xl">{title}</h2>
        </div>
        <div className="grid gap-8 sm:grid-cols-4">
          {steps.map((item) => (
            <div key={item.step} className="text-center space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-navy-900 text-gold-300 text-xl font-bold">
                {item.step}
              </div>
              <h3 className="font-bold text-lg">{item.title}</h3>
              <p className="text-sm text-navy-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
