import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, GraduationCap, Video, Users, CheckCircle2 } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans" data-testid="page-landing">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
            HL
          </div>
          <span className="font-bold text-xl tracking-tight text-gray-900">HaloLight OS</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in">
            <Button variant="ghost" className="font-medium text-gray-600 hover:text-gray-900" data-testid="button-landing-signin">
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

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center">
        <section className="w-full max-w-5xl mx-auto px-6 py-24 md:py-32 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary font-semibold text-sm mb-8 border border-primary/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Now Available for Partners
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-gray-900 mb-6 max-w-4xl leading-[1.1]">
            The complete operating system for <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">photobooth businesses</span>.
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl">
            HaloLight OS gives you everything you need to manage your equipment, train your team, and scale your photobooth operations — all in one unified cockpit.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/sign-up">
              <Button size="lg" className="h-14 px-8 text-lg font-medium shadow-md group">
                Start Building <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg font-medium bg-white">
                Partner Login
              </Button>
            </Link>
          </div>
        </section>

        {/* Features Grid */}
        <section className="w-full bg-white border-y py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Everything you need to scale</h2>
              <p className="text-lg text-gray-600">Built specifically for high-volume event professionals.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-2xl bg-gray-50 border border-gray-100 hover:border-primary/20 hover:shadow-lg transition-all group">
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Performance Tracking</h3>
                <p className="text-gray-600 leading-relaxed">
                  Monitor equipment utilization, event volume, and business KPIs in real-time from a central dashboard.
                </p>
              </div>

              <div className="p-8 rounded-2xl bg-gray-50 border border-gray-100 hover:border-primary/20 hover:shadow-lg transition-all group">
                <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">HaloLight Academy</h3>
                <p className="text-gray-600 leading-relaxed">
                  Train your staff with our comprehensive library of setup guides, troubleshooting steps, and best practices.
                </p>
              </div>

              <div className="p-8 rounded-2xl bg-gray-50 border border-gray-100 hover:border-primary/20 hover:shadow-lg transition-all group">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Priority Support</h3>
                <p className="text-gray-600 leading-relaxed">
                  Direct access to our hardware and software specialists when you need them most, right from the dashboard.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="w-full max-w-4xl mx-auto px-6 py-24 text-center">
          <div className="bg-sidebar rounded-3xl p-12 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-blue-400 to-primary"></div>
            <h2 className="text-3xl font-bold text-white mb-6">Ready to streamline your business?</h2>
            <p className="text-gray-400 text-lg mb-8 max-w-xl mx-auto">
              Join hundreds of professional event companies running their operations on HaloLight OS.
            </p>
            <Link href="/sign-up">
              <Button size="lg" className="h-12 px-8 text-base font-semibold">
                Create Partner Account
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-8 text-center text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} HaloLight Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}
