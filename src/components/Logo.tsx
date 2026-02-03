import { motion } from "framer-motion";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}

export function Logo({ size = "md", showTagline = false }: LogoProps) {
  const sizes = {
    sm: { icon: 32, text: "text-lg" },
    md: { icon: 40, text: "text-xl" },
    lg: { icon: 56, text: "text-3xl" },
  };

  const { icon, text } = sizes[size];

  return (
    <motion.div 
      className="flex items-center gap-3"
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      {/* 3D Filament Icon */}
      <div className="relative">
        <svg
          width={icon}
          height={icon}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-sm"
        >
          {/* Outer ring - filament spool */}
          <circle
            cx="24"
            cy="24"
            r="20"
            stroke="hsl(var(--overweel-deep))"
            strokeWidth="2.5"
            fill="none"
          />
          {/* Inner core */}
          <circle
            cx="24"
            cy="24"
            r="8"
            fill="hsl(var(--overweel-deep))"
          />
          {/* Filament strand coming out */}
          <motion.path
            d="M32 24 C36 24, 40 20, 42 16"
            stroke="hsl(var(--overweel-turquoise))"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, delay: 0.3 }}
          />
          {/* 3D layers effect */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <path
              d="M18 28 L24 32 L30 28 L24 24 Z"
              fill="hsl(var(--overweel-light))"
              opacity="0.8"
            />
            <path
              d="M18 24 L24 28 L30 24 L24 20 Z"
              fill="hsl(var(--overweel-turquoise))"
            />
            <path
              d="M18 20 L24 24 L30 20 L24 16 Z"
              fill="hsl(var(--overweel-deep))"
            />
          </motion.g>
        </svg>
        {/* Glow effect */}
        <div className="absolute inset-0 rounded-full bg-overweel-turquoise/20 blur-xl -z-10" />
      </div>

      {/* Text */}
      <div className="flex flex-col">
        <span className={`${text} font-bold text-primary tracking-tight`}>
          Overweel<span className="text-overweel-turquoise">3D</span>
        </span>
        {showTagline && (
          <motion.span 
            className="text-xs text-muted-foreground tracking-wide"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            Vorm. Functie. Filament.
          </motion.span>
        )}
      </div>
    </motion.div>
  );
}
