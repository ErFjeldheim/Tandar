import MapHost from "@/components/MapHost";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

export default function HomePage() {
  return (
    <main className="relative h-dvh w-dvw overflow-hidden">
      <MapHost />
      <ServiceWorkerRegistrar />
      <header className="pointer-events-none absolute top-3 right-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-800 shadow ring-1 ring-slate-200">
        Tandar · find a sunny spot
      </header>
    </main>
  );
}
