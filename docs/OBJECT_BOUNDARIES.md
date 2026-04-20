# Object Boundaries

This document maps where major domain objects live in LOCAL today and where they should likely move in a MULTI-USER architecture.

## User
**Current location (LOCAL):** `src/types/user.ts`, persisted in `src/stores/useUserStore.ts` as the device-local singleton.
**MULTI-USER destination:** User profile service plus a per-user aggregate/document in cloud storage.
**Relationships:** Owns `progression`, `lists`, `resources`, and `feed`; progression points to Badge, Gear, XP, Gold, Avatar, and stat state; lists point to GTD items, shopping lists, favourites, and routine refs.
**Known gaps:** `system.auth` and `publicProfile` are still `null` stubs, so there is no account identity, tenancy, or shareable profile model yet.

## Act
**Current location (LOCAL):** `src/types/act.ts`, persisted in `src/stores/useProgressionStore.ts` under `acts`.
**MULTI-USER destination:** Progression service scoped to a user or shared group campaign.
**Relationships:** Contains Chains; Quest refs encode the parent Act id; User progression and Coach unlock flows point at Acts.
**Known gaps:** `accountability` and `sharedContacts` are MULTI-USER stubs, and `toggle` remains a BUILD-time placeholder.

## Chain
**Current location (LOCAL):** `src/types/act.ts`, nested inside `Act.chains[]` in `useProgressionStore`.
**MULTI-USER destination:** Stored inside the progression aggregate for an Act, or split into a quest-graph service if chains become collaboratively edited.
**Relationships:** Act contains Chain; Chain contains Quest and optional adaptive quests.
**Known gaps:** `adaptiveQuests` is a future Coach insertion path and is not yet a first-class runtime system.

## Quest
**Current location (LOCAL):** `src/types/act.ts`, nested inside `Chain.quests[]` in `useProgressionStore`.
**MULTI-USER destination:** Progression service with event-driven updates from task, schedule, and resource services.
**Relationships:** Belongs to a Chain; tracks Markers through `timely.markers`; records Milestones in `milestones[]`; Task links back through `questRef`; some quests indirectly target TaskTemplate or Resource refs through Marker and SMARTER config.
**Known gaps:** `attainable`, `relevant`, and `result` are still open-ended placeholders instead of fully modeled subobjects.

## Milestone
**Current location (LOCAL):** `src/types/quest/Milestone.ts`, nested inside `Quest.milestones[]` in `useProgressionStore`.
**MULTI-USER destination:** Progress event log or immutable progression-history store.
**Relationships:** Points to Quest via `questRef`, Act via `actRef`, optional Resource via `resourceRef`, and embeds the fired `taskTemplateShape`.
**Known gaps:** It is only created from local task completion flow; there is no durable cross-device event stream yet.

## Marker
**Current location (LOCAL):** `src/types/quest/Marker.ts`, nested inside `Quest.timely.markers[]` in `useProgressionStore`.
**MULTI-USER destination:** Progression rules engine or automation service that can react to shared events.
**Relationships:** Points to Quest through `questRef`, to TaskTemplate through `taskTemplateRef`, and can fire Milestones or GTD side effects; event-created markers listen to system events such as `plannedEvent.created`.
**Known gaps:** Trigger routing is still limited, `sideEffects` only supports `gtdWrite`, and non-rollover automation is still narrow.

## PlannedEvent
**Current location (LOCAL):** `src/types/plannedEvent.ts`, persisted in `src/stores/useScheduleStore.ts` under `plannedEvents`.
**MULTI-USER destination:** Scheduling service with recurrence expansion, invitations, and reminder delivery.
**Relationships:** Event points back through `plannedEventRef`; User lists hold routine refs to PlannedEvents; task pools point to TaskTemplate ids.
**Known gaps:** `sharedWith` and `pushReminder` are stubs, so there is no invite model or real reminder backend.

## Event
**Current location (LOCAL):** `src/types/event.ts`, persisted in `src/stores/useScheduleStore.ts` under `activeEvents` and `historyEvents`.
**MULTI-USER destination:** Event execution/history service backed by a shared calendar or activity stream.
**Relationships:** Points to PlannedEvent through `plannedEventRef`; holds Task ids in `tasks`; may feed Experience creation and feed entries.
**Known gaps:** `sharedWith`, `coAttendees`, and richer location-sharing remain stubs; event ownership is still single-device.

## Task
**Current location (LOCAL):** `src/types/task.ts`, persisted in `src/stores/useScheduleStore.ts` under `tasks`; manual GTD items also live inside `User.lists.manualGtdList`.
**MULTI-USER destination:** Task execution service with per-user assignment and completion history.
**Relationships:** Points to TaskTemplate via `templateRef`, Quest via `questRef`, Act via `actRef`, and optional Resource via `resourceRef`; Events hold Task ids.
**Known gaps:** `sharedWith` and `attachmentRef` are stubs, and system/generated/manual task flows are still split across multiple local owners.

## TaskTemplate
**Current location (LOCAL):** `src/types/taskTemplate.ts`; static prebuilts in `src/coach/TaskTemplateLibrary.json`, onboarding system templates in `src/coach/StarterQuestLibrary.ts`, and user-custom templates in `src/stores/useScheduleStore.ts`.
**MULTI-USER destination:** Template catalog service with separate namespaces for system, coach bundle, and user-owned templates.
**Relationships:** Task points to TaskTemplate through `templateRef`; Marker points to TaskTemplate through `taskTemplateRef`; PlannedEvent task pools and User favourites list also store TaskTemplate ids.
**Known gaps:** There is no unified template registry yet, so templates are still split across bundle JSON, starter code, and user store state.

## Resource
**Current location (LOCAL):** `src/types/resource.ts`, persisted in `src/stores/useResourceStore.ts` under `resources`.
**MULTI-USER destination:** Resource graph service, likely one collection with subtype-specific payloads and relationship edges.
**Relationships:** Root object for Contact, Home, Vehicle, Account, Inventory, and Doc; Tasks may point to a Resource through `resourceRef`; User.resources stores typed Resource id lists.
**Known gaps:** MULTI-USER relationship semantics are still embedded in subtype meta fields rather than promoted into a shared graph or ownership model.

## Contact
**Current location (LOCAL):** `ContactMeta` in `src/types/resource.ts`, stored as `Resource.type === 'contact'` in `useResourceStore`.
**MULTI-USER destination:** Contacts/people service with shared identity resolution.
**Relationships:** `linkedContactRefs` points to other contacts; Home membership points back through `members` or room assignments; Vehicle usage can point to contacts through `memberContactRefs`.
**Known gaps:** Contact identity is local-only, relationship edges are plain refs, and there is no shared profile/contact merge logic.

## Home
**Current location (LOCAL):** `HomeMeta` in `src/types/resource.ts`, stored as `Resource.type === 'home'` in `useResourceStore`.
**MULTI-USER destination:** Household/home service with membership, chores, and shared ownership.
**Relationships:** Home points to contacts through `members`; Home points to Inventory via `linkedInventoryRef`; Home points to Docs via `linkedDocs`; Contacts can implicitly point back as members.
**Known gaps:** `recurringTasksStub` is still null, there is no shared-home permissions layer, and only one inventory link is modeled directly.

## Vehicle
**Current location (LOCAL):** `VehicleMeta` in `src/types/resource.ts`, stored as `Resource.type === 'vehicle'` in `useResourceStore`.
**MULTI-USER destination:** Asset/vehicle service with owner, operator, maintenance, and document links.
**Relationships:** Vehicle points to contacts through `memberContactRefs`; Vehicle points to Docs through `linkedDocs`; the intended owner relationship is currently represented by contact refs rather than a dedicated owner field.
**Known gaps:** `recurringTasksStub` is null, ownership semantics are loose, and maintenance scheduling is still local-only.

## Account
**Current location (LOCAL):** `AccountMeta` in `src/types/resource.ts`, stored as `Resource.type === 'account'` in `useResourceStore`.
**MULTI-USER destination:** Financial account service or finance subdomain with transaction ledger support.
**Relationships:** Account points to Home/Vehicle/Contact context through `linkedResourceRef`; Home can point back through resource links; ShoppingList items can push pending transactions into Account resources.
**Known gaps:** `recurrenceRuleRef` is only a loose pointer, there is no true transaction entity/service, and multi-user household finance access is not modeled.

## Inventory
**Current location (LOCAL):** `InventoryMeta` in `src/types/resource.ts`, stored as `Resource.type === 'inventory'` in `useResourceStore`.
**MULTI-USER destination:** Inventory/asset stock service tied to homes, vehicles, or users.
**Relationships:** Inventory points to parent resources through `linkedResourceRefs`; Home points to Inventory through `linkedInventoryRef`; Inventory items and containers can point to other resources through `linkedResourceRef`.
**Known gaps:** Inventory relationships are flexible but not normalized, and there is no shared stock, reservation, or audit model.

## Doc
**Current location (LOCAL):** `DocMeta` in `src/types/resource.ts`, stored as `Resource.type === 'doc'` in `useResourceStore`.
**MULTI-USER destination:** Document service with metadata, attachments, and optional collaboration/version history.
**Relationships:** Doc points to an owning resource through `linkedResourceRef` and can also point to multiple resources through `linkedResourceRefs`; Home, Vehicle, and Account keep Doc refs in their meta; starter logging tasks describe logging to Docs.
**Known gaps:** `progression` is still null, course-doc behavior is deferred, and there is no file storage/versioning/collaboration layer.

## Badge
**Current location (LOCAL):** `src/types/itemTemplate.ts` plus `src/types/badgeBoard.ts`; stored in `User.progression.badgeBoard.earned` and `.pinned` inside `useUserStore`.
**MULTI-USER destination:** Rewards/collectibles service with optional public showcase data.
**Relationships:** Badge points to Achievement through `contents.achievementRef`; User progression points to Badge through BadgeBoard.
**Known gaps:** Public sharing is stubbed, and Badge instances live inside user state instead of a dedicated rewards inventory service.

## Gear
**Current location (LOCAL):** Gear definition in `src/types/itemTemplate.ts` / `src/types/coach.ts`; ownership in `User.progression.equipment.equipment` and equipped slots in `User.progression.avatar.equippedGear` inside `useUserStore`.
**MULTI-USER destination:** Rewards/inventory service with equip state stored alongside the user profile.
**Relationships:** User progression points to Gear ids through Equipment and Avatar slot refs; Achievement definitions can trigger Gear rewards through `rewardRef`.
**Known gaps:** LOCAL stores only awarded gear ids, not full Gear instances, so inventory metadata, provenance, and duplication handling are still under-modeled.

## Feed
**Current location (LOCAL):** `src/types/feed.ts`, nested in `User.feed` and persisted through `useUserStore`.
**MULTI-USER destination:** Notification/activity service with per-user inbox plus shared/social fan-out.
**Relationships:** Feed entries may point to any triggering object through `triggerRef`; badge, gear, task, quest, and system flows write into Feed.
**Known gaps:** `sharedActivityEntries` is still null and there is no server-side notification delivery or read-state sync.

## GTDItem
**Current location (LOCAL):** `src/types/task.ts`, stored in `User.lists.manualGtdList` in `useUserStore`; system-generated GTD uses Task ids in `User.lists.gtdList`.
**MULTI-USER destination:** Unified inbox/task service with explicit item assignment and source metadata.
**Relationships:** May point to Resource through `resourceRef`; Marker side effects can generate GTD items; User lists own both manual GTD items and generated Task refs.
**Known gaps:** Manual GTD and generated GTD are separate models today, which will make sync, dedupe, and collaboration harder until unified.

## ShoppingList
**Current location (LOCAL):** `src/types/user.ts`, nested in `User.lists.shoppingLists` and updated by `src/engine/listsEngine.ts`.
**MULTI-USER destination:** Shared list service with household collaboration and transaction handoff.
**Relationships:** Shopping items may point to Account via `accountRef`; completed items can create pending transactions on Account resources; items may also point to useables through `useableRef`.
**Known gaps:** There is no concurrent editing, household ownership, or item-level assignment model.

## Achievement
**Current location (LOCAL):** Definition type in `src/types/coach.ts`, static data in `src/coach/AchievementLibrary.json`, evaluated by `src/coach/checkAchievements.ts`.
**MULTI-USER destination:** Achievement rules/catalog service plus a user-achievement ledger.
**Relationships:** Badge points back to Achievement through `achievementRef`; CharacterLibrary sticker models also point to `achievementRef`; reward pipeline converts Achievement unlocks into Badges and sometimes Gear.
**Known gaps:** Unlock state is implicit through awarded Badges instead of an explicit achievement record, and evaluation is still device-local.

## Cross-Object Relationship Map

```text
Contact ──linkedContactRefs──► Contact
Contact ◄──members / assignedTo── Home
Account ──linkedResourceRef / belongs──► Home
Inventory ──linkedResourceRefs / belongs──► Home
Doc ──linkedResourceRef(s) / belongs──► Resource
Vehicle ──memberContactRefs / owner-user──► Contact

Task ──templateRef──► TaskTemplate
Task ──questRef──► Quest
Task ──resourceRef──► Resource
Event ──plannedEventRef──► PlannedEvent
Marker ──taskTemplateRef──► TaskTemplate
Marker ──fires──► Milestone

User ──progression──► Badge
User ──progression──► Gear
User ──progression──► XP / Gold / Stats
Act ──contains──► Chain ──contains──► Quest
Quest ──tracks──► Marker ──fires──► Milestone
Badge ──achievementRef──► Achievement
```
