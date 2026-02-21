import logoDark from "@/assets/logo-dark.jpg";
import logoLight from "@/assets/logo-light.png";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  forceDark?: boolean;
}

export function Logo({ size = "md", showTagline = false, forceDark = false }: LogoProps) {
  const sizes = {
    sm: "h-8",
    md: "h-10",
    lg: "h-14",
    xl: "h-20",
  };

  return (
    <div className="flex items-center gap-3">
      <img
        src={forceDark ? logoDark : logoLight}
        alt="Overweel3D"
        className={`${sizes[size]} w-auto object-contain dark:hidden ${forceDark ? "hidden" : ""}`}
      />
      <img
        src={forceDark ? logoDark : logoDark}
        alt="Overweel3D"
        className={`${sizes[size]} w-auto object-contain hidden dark:block ${forceDark ? "!block" : ""}`}
      />
    </div>
  );
}
