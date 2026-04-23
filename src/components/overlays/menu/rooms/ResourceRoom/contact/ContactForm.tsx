import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ContactResource, ResourceNote } from '../../../../../../types/resource';
import { CONTACT_GROUPS } from '../../../../../../types/resource';
import type { ContactGroup } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { generateGTDItems, generateScheduledTasks } from '../../../../../../engine/resourceEngine';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { IconPicker } from '../../../../../shared/IconPicker';
import { NotesLogEditor } from '../../../../../shared/NotesLogEditor';

interface ContactFormProps {
  existing?: ContactResource;
  onSaved: () => void;
  onCancel: () => void;
}

export function ContactForm({ existing, onSaved, onCancel }: ContactFormProps) {
  const [iconKey, setIconKey] = useState<string>(existing?.icon ?? 'social');
  const [displayName, setDisplayName] = useState(existing?.displayName ?? existing?.name ?? '');
  const [groups, setGroups] = useState<ContactGroup[]>(existing?.groups ?? []);
  const [customGroups, setCustomGroups] = useState<string[]>(existing?.customGroups ?? []);
  const [customGroupInput, setCustomGroupInput] = useState('');
  const [birthday, setBirthday] = useState(existing?.birthday ?? '');
  const [birthdayLeadDays, setBirthdayLeadDays] = useState<number>(existing?.birthdayLeadDays ?? 14);
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [notes, setNotes] = useState<ResourceNote[]>(existing?.notes ?? []);

  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);
  const currentExisting = existing ? resources[existing.id] as ContactResource | undefined : undefined;
  const customGroupOptions = useMemo(() => {
    const allTags = new Set<string>();
    for (const resource of Object.values(resources)) {
      if (resource.type !== 'contact') continue;
      for (const tag of resource.customGroups ?? []) {
        const normalizedTag = tag.trim();
        if (normalizedTag) allTags.add(normalizedTag);
      }
    }
    for (const tag of customGroups) {
      const normalizedTag = tag.trim();
      if (normalizedTag) allTags.add(normalizedTag);
    }
    return Array.from(allTags).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }, [customGroups, resources]);

  function toggleGroup(group: ContactGroup) {
    setGroups((prev) => (
      prev.includes(group)
        ? prev.filter((entry) => entry !== group)
        : [...prev, group]
    ));
  }

  function addCustomGroup() {
    const nextTag = customGroupInput.trim();
    if (!nextTag) return;
    setCustomGroups((prev) => (prev.includes(nextTag) ? prev : [...prev, nextTag]));
    setCustomGroupInput('');
  }

  function removeCustomGroup(tag: string) {
    setCustomGroups((prev) => prev.filter((entry) => entry !== tag));
  }

  function toggleCustomGroup(tag: string) {
    setCustomGroups((prev) => (
      prev.includes(tag)
        ? prev.filter((entry) => entry !== tag)
        : [...prev, tag]
    ));
  }

  const canSave = displayName.trim().length > 0;

  function handleSave() {
    if (!canSave) return;

    const now = new Date().toISOString();
    const resource: ContactResource = {
      id: existing?.id ?? uuidv4(),
      type: 'contact',
      icon: iconKey,
      name: displayName.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      displayName: displayName.trim(),
      groups,
      customGroups: customGroups.length > 0 ? customGroups : undefined,
      phone: phone || undefined,
      email: email || undefined,
      birthday: birthday || undefined,
      birthdayLeadDays: birthday ? birthdayLeadDays : undefined,
      address: address || undefined,
      linkedContacts: currentExisting?.linkedContacts ?? existing?.linkedContacts,
      notes,
      links: currentExisting?.links ?? existing?.links,
      linkedHomeId: currentExisting?.linkedHomeId ?? existing?.linkedHomeId,
      linkedAccountIds: currentExisting?.linkedAccountIds ?? existing?.linkedAccountIds,
      sharedProfile: currentExisting?.sharedProfile ?? existing?.sharedProfile ?? null,
    };

    setResource(resource);

    if (!existing && user) {
      const updatedUser = {
        ...user,
        resources: {
          ...user.resources,
          contacts: user.resources.contacts.includes(resource.id)
            ? user.resources.contacts
            : [...user.resources.contacts, resource.id],
        },
      };
      setUser(updatedUser);
    }

    generateScheduledTasks(resource);
    generateGTDItems(resource);
    onSaved();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          Back
        </button>
        <h3 className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          {existing ? 'Edit Contact' : 'New Contact'}
        </h3>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={`text-sm font-semibold transition-colors ${
            canSave ? 'text-blue-500 hover:text-blue-600' : 'text-gray-300'
          }`}
        >
          Save
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <IconPicker value={iconKey} onChange={setIconKey} />
          <TextInput
            label="Name *"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Full name"
            maxLength={100}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Groups</label>
          <div className="flex flex-wrap gap-1.5">
            {CONTACT_GROUPS.map((group) => {
              const selected = groups.includes(group);
              return (
                <button
                  key={group}
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    selected
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {group}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Custom groups</label>
          <div className="flex gap-2">
            <TextInput
              value={customGroupInput}
              onChange={setCustomGroupInput}
              placeholder="Add custom tag"
              maxLength={40}
              className="flex-1"
            />
            <button
              type="button"
              onClick={addCustomGroup}
              className="self-end rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-blue-400 hover:text-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
            >
              Add
            </button>
          </div>
          {customGroupOptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customGroupOptions.map((tag) => {
                const selected = customGroups.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleCustomGroup(tag)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-emerald-300 bg-white text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-gray-800 dark:text-emerald-300'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
          {customGroups.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customGroups.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => removeCustomGroup(tag)}
                  className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  {tag} ×
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Birthday</label>
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Reminder</label>
            <select
              value={birthday ? birthdayLeadDays : ''}
              disabled={!birthday}
              onChange={(e) => setBirthdayLeadDays(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value={-1}>Never</option>
              <option value={0}>Day of</option>
              <option value={3}>3 days before</option>
              <option value={7}>7 days before</option>
              <option value={14}>14 days before</option>
              <option value={30}>30 days before</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label="Phone"
            value={phone}
            onChange={setPhone}
            placeholder="+1 555 000 0000"
            maxLength={40}
          />
          <TextInput
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="email@example.com"
            maxLength={120}
          />
        </div>

        <TextInput
          label="Address"
          value={address}
          onChange={setAddress}
          placeholder="123 Main St"
          maxLength={200}
        />

        <NotesLogEditor
          notes={notes}
          onChange={setNotes}
          resource={existing}
          linkTabLabel="Relationships"
          allowedLinkTypes={['contact']}
        />
      </div>
    </div>
  );
}
