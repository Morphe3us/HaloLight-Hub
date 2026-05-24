import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, GraduationCap, Users, CheckCircle2, Monitor, Sparkles } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans" data-testid="page-landing">
      {/* Header */}
      <header className="bg-background/80 backdrop-blur-md border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <img src="/logo-hub-light.png" alt="HaloLight Hub" className="w-[120px] h-auto object-contain dark:hidden" />
          <img src="/logo-hub.png" alt="HaloLight Hub" className="w-[120px] h-auto object-contain hidden dark:block" />
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" className="font-medium text-muted-foreground hover:text-foreground" data-testid="button-landing-signin">
              Sign In
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button className="font-medium shadow-sm" data-testid="button-landing-signup">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center">
        {/* Hero */}
        <section className="w-full max-w-5xl mx-auto px-6 py-24 md:py-32 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/20 text-foreground font-semibold text-sm mb-8 border border-accent/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
            Now Available for Partners
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground mb-6 max-w-4xl leading-[1.1]">
            The complete hub for{" "}
            <span style={{ color: "#DDB398" }}>photobooth businesses</span>.
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
            HaloLight Hub gives you everything you need to manage your equipment, train your team, and scale your photobooth operations — all in one unified cockpit.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/sign-up">
              <Button size="lg" className="h-14 px-8 text-lg font-medium shadow-md group">
                Start Building <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-medium">
                Partner Login
              </Button>
            </Link>
          </div>
        </section>

        {/* Features Grid */}
        <section className="w-full bg-card border-y border-border py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-foreground mb-4">Everything you need to scale</h2>
              <p className="text-lg text-muted-foreground">Built specifically for high-volume event professionals.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: BarChart3,
                  color: "bg-accent/15 text-foreground",
                  title: "Performance Tracking",
                  desc: "Monitor equipment utilization, event volume, and business KPIs in real-time from a central dashboard.",
                },
                {
                  icon: GraduationCap,
                  color: "bg-info/15 text-foreground",
                  title: "HaloLight Academy",
                  desc: "Train your staff with our comprehensive library of setup guides, troubleshooting steps, and best practices.",
                },
                {
                  icon: Users,
                  color: "bg-success/15 text-foreground",
                  title: "Priority Support",
                  desc: "Direct access to our hardware and software specialists when you need them most, right from the dashboard.",
                },
                {
                  icon: Monitor,
                  color: "bg-warning/15 text-foreground",
                  title: "Equipment Registry",
                  desc: "Track every unit, warranty status, and maintenance history. Never miss a service window again.",
                },
                {
                  icon: Sparkles,
                  color: "bg-accent/15 text-foreground",
                  title: "AI Assistant",
                  desc: "Get instant answers to technical questions, event prep guidance, and business insights — always available.",
                },
                {
                  icon: CheckCircle2,
                  color: "bg-success/15 text-foreground",
                  title: "Guided Onboarding",
                  desc: "A structured launch plan gets your team productive from day one with step-by-step milestones.",
                },
              ].map(({ icon: Icon, color, title, desc }) => (
                <div key={title} className="p-8 rounded-2xl bg-background border border-border hover:border-accent/40 hover:shadow-md transition-all duration-200 group">
                  <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-200`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-sm">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="w-full max-w-4xl mx-auto px-6 py-24 text-center">
          <div className="bg-foreground rounded-3xl p-12 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-accent rounded-t-3xl"></div>
            <h2 className="text-3xl font-bold text-background mb-4">Ready to streamline your business?</h2>
            <p className="text-background/80 text-lg mb-8 max-w-xl mx-auto">
              Join hundreds of professional event companies running their operations on HaloLight Hub.
            </p>
            <Link href="/sign-up">
              <Button size="lg" className="h-12 px-8 text-base font-semibold bg-accent text-foreground hover:bg-accent/90 border-0 shadow-none">
                Create Partner Account
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-card border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} HaloLight Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}
