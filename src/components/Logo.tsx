import logo from "@/assets/logo.png";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  forceDark?: boolean;
}

export function Logo({ size = "md" }: LogoProps) {
  const sizes = {
    sm: "h-8",
    md: "h-10",
    lg: "h-14",
    xl: "h-20",
  };

  return (
    <div className="flex items-center gap-3">
      <img
        src={logo}
        alt="Overweel3D"
        className={`${sizes[size]} w-auto object-contain`}
      />
    </div>
  );
}
