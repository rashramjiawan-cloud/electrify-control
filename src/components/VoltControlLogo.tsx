import { cn } from '@/lib/utils';

interface VoltControlLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const VoltControlLogo = ({ size = 'md', className }: VoltControlLogoProps) => {
  const sizes = {
    sm: { icon: 'h-8 w-8', bolt: 'h-4 w-4', title: 'text-xs', sub: 'text-[9px]' },
    md: { icon: 'h-9 w-9', bolt: 'h-5 w-5', title: 'text-sm', sub: 'text-[10px]' },
    lg: { icon: 'h-12 w-12', bolt: 'h-6 w-6', title: 'text-xl', sub: 'text-xs' },
  };

  const s = sizes[size];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Animated voltage icon */}
      <div className={cn('relative flex items-center justify-center rounded-lg bg-primary/10', s.icon)}>
        {/* Outer glow ring animation */}
        <div className="absolute inset-0 rounded-lg animate-[volt-pulse_3s_ease-in-out_infinite]" />
        
        {/* Electric arcs */}
        <div className="absolute inset-0 rounded-lg overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-2 bg-gradient-to-b from-primary/60 to-transparent animate-[volt-arc-down_2s_ease-in-out_infinite]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1px] h-2 bg-gradient-to-t from-primary/60 to-transparent animate-[volt-arc-up_2.5s_ease-in-out_infinite_0.5s]" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[1px] w-2 bg-gradient-to-r from-primary/60 to-transparent animate-[volt-arc-right_2.2s_ease-in-out_infinite_0.3s]" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[1px] w-2 bg-gradient-to-l from-primary/60 to-transparent animate-[volt-arc-left_2.8s_ease-in-out_infinite_0.7s]" />
        </div>

        {/* Bolt icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={cn(s.bolt, 'text-primary relative z-10 animate-[volt-flicker_4s_ease-in-out_infinite]')}
        >
          <path
            d="M13 2L4.5 12.5H11.5L10.5 22L19.5 11.5H12.5L13 2Z"
            fill="currentColor"
            className="drop-shadow-[0_0_6px_hsl(var(--primary))]"
          />
        </svg>

        {/* Corner sparks */}
        <div className="absolute -top-0.5 -right-0.5 h-1 w-1 rounded-full bg-primary animate-[volt-spark_3s_ease-in-out_infinite_0.2s]" />
        <div className="absolute -bottom-0.5 -left-0.5 h-0.5 w-0.5 rounded-full bg-primary animate-[volt-spark_3.5s_ease-in-out_infinite_1s]" />
      </div>

      {/* Text with voltage effect */}
      <div>
        <h1 className={cn('font-mono font-bold text-foreground tracking-wider', s.title)}>
          <span className="inline-flex">
            {'VOLT'.split('').map((char, i) => (
              <span
                key={i}
                className="inline-block animate-[volt-letter_4s_ease-in-out_infinite]"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                {char}
              </span>
            ))}
          </span>
          <span className="text-primary animate-[volt-flicker_3s_ease-in-out_infinite]">CONTROL</span>
        </h1>
        <p className={cn('font-mono text-muted-foreground tracking-widest', s.sub)}>
          <span className="inline-flex items-center gap-1">
            <span className="h-[1px] w-2 bg-primary/40 animate-[volt-line_2s_ease-in-out_infinite]" />
            BV
            <span className="h-[1px] w-2 bg-primary/40 animate-[volt-line_2s_ease-in-out_infinite_0.5s]" />
          </span>
        </p>
      </div>
    </div>
  );
};

export default VoltControlLogo;
