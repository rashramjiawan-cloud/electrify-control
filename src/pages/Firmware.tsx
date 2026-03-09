import AppLayout from '@/components/AppLayout';
import { useChargePoints } from '@/hooks/useChargePoints';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HardDrive, Globe, FileCode2 } from 'lucide-react';
import FirmwareLocalUpload from '@/components/firmware/FirmwareLocalUpload';
import FirmwareRemoteUpdate from '@/components/firmware/FirmwareRemoteUpdate';
import FirmwareOcppProtocol from '@/components/firmware/FirmwareOcppProtocol';

const Firmware = () => {
  const { data: chargePoints } = useChargePoints();

  return (
    <AppLayout title="Firmware Management" subtitle="Firmware updates en diagnostics voor laadpalen">
      <Tabs defaultValue="local" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="local" className="gap-2 text-xs">
            <HardDrive className="h-3.5 w-3.5" />
            Lokaal bestand
          </TabsTrigger>
          <TabsTrigger value="remote" className="gap-2 text-xs">
            <Globe className="h-3.5 w-3.5" />
            Remote update
          </TabsTrigger>
          <TabsTrigger value="ocpp" className="gap-2 text-xs">
            <FileCode2 className="h-3.5 w-3.5" />
            Protocol OCPP
          </TabsTrigger>
        </TabsList>

        <TabsContent value="local">
          <FirmwareLocalUpload chargePoints={chargePoints} />
        </TabsContent>

        <TabsContent value="remote">
          <FirmwareRemoteUpdate chargePoints={chargePoints} />
        </TabsContent>

        <TabsContent value="ocpp">
          <FirmwareOcppProtocol />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Firmware;
