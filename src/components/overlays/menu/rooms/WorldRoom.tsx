import worldBg from '../../../../assets/icons/background-worldView.svg';

/** BUILD-TIME STUB: WorldRoom - map view placeholder */
export function WorldRoom() {
  return (
    <div
      className="w-full h-full relative overflow-hidden flex flex-col items-center justify-center"
      style={{
        backgroundImage: `url(${worldBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />
      <div className="relative text-center">
        <p className="text-5xl mb-4">🗺️</p>
        <p className="text-green-300 text-sm font-semibold uppercase tracking-widest">World View</p>
        <p className="text-green-600 text-xs mt-2">Coming soon</p>
      </div>
    </div>
  );
}
