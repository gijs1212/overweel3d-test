import logoDark from "@/assets/logo.png";
import logoLight from "@/assets/logo-white.png";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  surface?: "light" | "dark";
}

export function Logo({ size = "md", surface = "light" }: LogoProps) {
  const sizes = {
    sm: "h-8 w-8",
    md: "h-12 w-12 md:h-14 md:w-14",
    lg: "h-14 w-14",
    xl: "h-20 w-20",
  };

  return (
    <div className={`${sizes[size]} flex shrink-0 items-center justify-center overflow-visible`}>
      <img
        src={surface === "dark" ? logoLight : logoDark}
        alt="Overweel3D"
        className={`h-full w-full scale-[2] object-contain ${surface === "dark" ? "-translate-y-1" : "translate-y-4"}`}
      />
    </div>
  );
}
