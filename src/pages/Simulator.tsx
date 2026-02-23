import { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, X, Zap } from 'lucide-react';
import SimulatorChargePointTab from '@/components/simulator/SimulatorChargePointTab';

interface ChargePointInstance {
  id: string;
  label: string;
}

const Simulator = () => {
  const [instances, setInstances] = useState<ChargePointInstance[]>([
    { id: 'SIM-001', label: 'SIM-001' },
  ]);
  const [activeTab, setActiveTab] = useState('SIM-001');
  const [newId, setNewId] = useState('');

  const addInstance = useCallback(() => {
    const id = newId.trim() || `SIM-${String(instances.length + 1).padStart(3, '0')}`;
    if (instances.some(i => i.id === id)) return;
    setInstances(prev => [...prev, { id, label: id }]);
    setActiveTab(id);
    setNewId('');
  }, [newId, instances]);

  const removeInstance = useCallback((idToRemove: string) => {
    setInstances(prev => {
      const next = prev.filter(i => i.id !== idToRemove);
      if (activeTab === idToRemove && next.length > 0) {
        setActiveTab(next[0].id);
      }
      return next;
    });
  }, [activeTab]);

  return (
    <AppLayout title="OCPP Simulator" subtitle="Simuleer meerdere laadpalen tegelijk via OCPP 1.6J">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <TabsList className="h-auto flex-wrap">
            {instances.map(inst => (
              <TabsTrigger key={inst.id} value={inst.id} className="gap-2 pr-1.5">
                <Zap className="h-3.5 w-3.5" />
                {inst.label}
                {instances.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); removeInstance(inst.id); }}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex items-center gap-2">
            <Input
              value={newId}
              onChange={e => setNewId(e.target.value)}
              placeholder="CP-ID (optioneel)"
              className="w-36 h-9 text-xs font-mono"
              onKeyDown={e => e.key === 'Enter' && addInstance()}
            />
            <Button variant="outline" size="sm" onClick={addInstance} className="gap-1.5 h-9">
              <Plus className="h-3.5 w-3.5" />
              Laadpaal
            </Button>
          </div>
        </div>

        {instances.map(inst => (
          <TabsContent key={inst.id} value={inst.id}>
            <SimulatorChargePointTab config={inst} />
          </TabsContent>
        ))}
      </Tabs>
    </AppLayout>
  );
};

export default Simulator;
