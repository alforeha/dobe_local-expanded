// ContactMetaView - read-only display of ContactResource fields.

import type { ContactResource } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { ResourceMetaTabs } from '../shared/ResourceMetaTabs';

interface ContactMetaViewProps {
  resource: ContactResource;
}

function daysUntilAnnual(isoDate: string): number | null {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length < 3) return null;
  const thisYear = today.getFullYear();
  const candidate = new Date(`${thisYear}-${parts[1]}-${parts[2]}T00:00:00`);
  if (candidate < today) candidate.setFullYear(thisYear + 1);
  return Math.round((candidate.getTime() - today.getTime()) / 86_400_000);
}

function formatBirthday(isoDate: string): string {
  const date = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

export function ContactMetaView({ resource }: ContactMetaViewProps) {
  const resources = useResourceStore((s) => s.resources);

  const hasAny =
    resource.phone ||
    resource.email ||
    resource.birthday ||
    resource.address ||
    (resource.linkedContacts && resource.linkedContacts.length > 0) ||
    (resource.notes && resource.notes.length > 0);

  const details = (
    <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 mb-1">
      {!hasAny ? (
        <p className="text-xs text-gray-400 italic">No details on file.</p>
      ) : null}
      {resource.phone && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Phone</span>
          <span>{resource.phone}</span>
        </div>
      )}
      {resource.email && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Email</span>
          <span className="truncate">{resource.email}</span>
        </div>
      )}
      {resource.birthday && (
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-16 shrink-0">Birthday</span>
          <span className="flex items-center gap-1.5">
            {formatBirthday(resource.birthday)}
            {(() => {
              const days = daysUntilAnnual(resource.birthday);
              if (days === null) return null;
              if (days === 0) {
                return (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                    Today!
                  </span>
                );
              }
              if (days <= 14) {
                return (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                    in {days}d
                  </span>
                );
              }
              return (
                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400">
                  in {days}d
                </span>
              );
            })()}
          </span>
        </div>
      )}
      {resource.address && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Address</span>
          <span>{resource.address}</span>
        </div>
      )}
      {resource.linkedContacts && resource.linkedContacts.length > 0 && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Linked</span>
          <div className="flex flex-col gap-0.5">
            {resource.linkedContacts.map((link) => (
              <span key={link.contactId}>
                {resources[link.contactId]?.name ?? link.contactId}
                {link.relationship && (
                  <span className="text-gray-400"> - {link.relationship}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return <ResourceMetaTabs resource={resource} details={details} />;
}
