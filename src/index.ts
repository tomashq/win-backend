import ServerService from './services/ServerService';
import { port, prometheusEnabled } from './config';
import { MetricsService } from './services/MetricsService';
import { QueueService } from './services/QueueService';
import { GroupQueueService } from './services/GroupQueueService';
import { RewardQueueService } from './services/RewardQueueService';

process.on('unhandledRejection', async (error) => {
  console.log(error);
  process.exit(1);
});

const main = async (): Promise<void> => {
  const server = new ServerService(port);

  if (prometheusEnabled) {
    await MetricsService.startMetricsServer();
  }

  await QueueService.getInstance().runDealWorker();
  await QueueService.getInstance().runContractWorker();
  await GroupQueueService.getInstance().runGroupDealWorker();
  await RewardQueueService.getInstance().runRewardsWorker();

  await server.start();
};

export default main().catch(async (error) => {
  console.log(error);
  process.exit(1);
});
