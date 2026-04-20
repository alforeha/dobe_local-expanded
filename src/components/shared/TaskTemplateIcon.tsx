import { IconDisplay } from './IconDisplay';

interface TaskTemplateIconProps {
  iconKey: string;
  size: number;
  className?: string;
  alt?: string;
}

export function TaskTemplateIcon({ iconKey, size, className, alt = '' }: TaskTemplateIconProps) {
  return <IconDisplay iconKey={iconKey} size={size} className={className} alt={alt} />;
}
