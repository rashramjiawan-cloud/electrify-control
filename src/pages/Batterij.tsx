import AppLayout from '@/components/AppLayout';

const Batterij = () => {
  return (
    <AppLayout title="Batterij" subtitle="Battery Energy Storage System">
      <div className="text-center py-12 text-muted-foreground">
        Geen batterijdata beschikbaar. Verbind een batterijsysteem om live data te zien.
      </div>
    </AppLayout>
  );
};

export default Batterij;
