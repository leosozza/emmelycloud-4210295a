import { cn } from "@/lib/utils";

interface LumaSpinProps {
  className?: string;
  size?: number;
}

export function LumaSpin({ className, size = 70 }: LumaSpinProps) {
  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <div
        className="absolute rounded-[5px] animate-loaderAnim"
        style={{
          inset: "0 35px 35px 0",
          background: "hsl(var(--primary))",
        }}
      />
      <div
        className="absolute rounded-[5px] animate-loaderAnim animation-delay"
        style={{
          inset: "0 35px 35px 0",
          background: "hsl(var(--accent))",
        }}
      />
      <style>{`
        @keyframes loaderAnim {
          0%   { inset: 0 35px 35px 0; }
          12.5%{ inset: 0 35px 0 0; }
          25%  { inset: 35px 35px 0 0; }
          37.5%{ inset: 35px 0 0 0; }
          50%  { inset: 35px 0 0 35px; }
          62.5%{ inset: 0 0 0 35px; }
          75%  { inset: 0 0 35px 35px; }
          87.5%{ inset: 0 0 35px 0; }
          100% { inset: 0 35px 35px 0; }
        }
        .animate-loaderAnim {
          animation: loaderAnim 2.5s infinite;
        }
        .animation-delay {
          animation-delay: -1.25s;
        }
      `}</style>
    </div>
  );
}
