import logo from "@/assets/logo.png";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  forceDark?: boolean;
}

export function Logo({ size = "md" }: LogoProps) {
  const sizes = {
    sm: "h-8 w-8",
    md: "h-12 w-12 md:h-14 md:w-14",
    lg: "h-14 w-14",
    xl: "h-20 w-20",
  };

  return (
    <div className={`${sizes[size]} flex shrink-0 items-center justify-center overflow-visible`}>
      <img
        src={logo}
        alt="Overweel3D"
        className="h-full w-full scale-[2] translate-y-0.5 object-contain"
      />
    </div>
  );
}
