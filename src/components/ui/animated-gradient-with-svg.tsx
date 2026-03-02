import React, { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useDimensions } from "@/components/hooks/use-debounced-dimensions";

interface AnimatedGradientProps {
  colors: string[];
  speed?: number;
  blur?: "light" | "medium" | "heavy";
}

const randomInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const AnimatedGradient: React.FC<AnimatedGradientProps> = ({
  colors,
  speed = 5,
  blur = "light",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dimensions = useDimensions(containerRef);

  const circleSize = useMemo(
    () => Math.max(dimensions.width, dimensions.height),
    [dimensions.width, dimensions.height]
  );

  const blurClass =
    blur === "light"
      ? "blur-2xl"
      : blur === "medium"
        ? "blur-3xl"
        : "blur-[100px]";

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <div className={cn("absolute inset-0", blurClass)}>
        <svg
          className="absolute inset-0 w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {colors.map((color, index) => (
            <circle
              key={index}
              cx="50%"
              cy="50%"
              r={circleSize * 0.45}
              fill={color}
              className="animate-background-gradient"
              style={{
                opacity: 0.5,
                "--background-gradient-speed": `${speed + randomInt(-2, 2)}s`,
                "--background-gradient-delay": `${index * -3}s`,
                "--tx-1": `${randomInt(-40, 40) / 100}`,
                "--ty-1": `${randomInt(-40, 40) / 100}`,
                "--tx-2": `${randomInt(-40, 40) / 100}`,
                "--ty-2": `${randomInt(-40, 40) / 100}`,
                "--tx-3": `${randomInt(-40, 40) / 100}`,
                "--ty-3": `${randomInt(-40, 40) / 100}`,
                "--tx-4": `${randomInt(-40, 40) / 100}`,
                "--ty-4": `${randomInt(-40, 40) / 100}`,
              } as React.CSSProperties}
            />
          ))}
        </svg>
      </div>
    </div>
  );
};

export { AnimatedGradient };
