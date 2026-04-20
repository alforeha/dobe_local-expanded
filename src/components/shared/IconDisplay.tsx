import { isImageIcon, resolveIcon } from '../../constants/iconMap';

interface IconDisplayProps {
  iconKey: string;
  size?: number | string;
  className?: string;
  alt?: string;
}

function toSizeStyle(size: number | string | undefined) {
  if (typeof size === 'number') {
    return { width: size, height: size };
  }

  if (typeof size === 'string' && size.trim()) {
    return { width: size, height: size };
  }

  return undefined;
}

export function IconDisplay({ iconKey, size, className, alt = '' }: IconDisplayProps) {
  const resolved = resolveIcon(iconKey);

  if (isImageIcon(resolved)) {
    return (
      <img
        src={resolved}
        alt={alt}
        className={className}
        style={toSizeStyle(size)}
      />
    );
  }

  return (
    <span
      className={className}
      style={typeof size === 'number' ? { fontSize: size } : undefined}
      aria-hidden={alt ? undefined : 'true'}
    >
      {resolved}
    </span>
  );
}
