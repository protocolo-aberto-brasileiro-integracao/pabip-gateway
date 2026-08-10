import type { Command } from 'commander';
import { resolveClientConfig } from '../config';
import { request } from '../http-client';
import { printResult } from '../output';
import { buildPaginationQuery, parsePositiveInt, type PageOptions } from '../pagination';

export function registerPassthroughCommands(program: Command): void {
  const passthrough = program
    .command('passthrough')
    .description("Relay reads/writes to a specific peer's own API, by peer id.");

  const listNodes = passthrough
    .command('sensor-nodes')
    .description('List sensor nodes reported by a peer.')
    .requiredOption('--peer <peerId>')
    .option('--page <n>', 'page number', parsePositiveInt)
    .option('--page-size <n>', 'items per page (max 500)', parsePositiveInt)
    .action(async (options: PageOptions & { peer: string }) => {
      const client = resolveClientConfig(listNodes.optsWithGlobals());
      printResult(
        await request(
          client,
          'GET',
          `/peers/${encodeURIComponent(options.peer)}/sensor-nodes${buildPaginationQuery(options)}`,
        ),
      );
    });

  const getNode = passthrough
    .command('sensor-node <nodeId>')
    .description('Show a single sensor node reported by a peer.')
    .requiredOption('--peer <peerId>')
    .action(async (nodeId: string, options: { peer: string }) => {
      const client = resolveClientConfig(getNode.optsWithGlobals());
      printResult(
        await request(
          client,
          'GET',
          `/peers/${encodeURIComponent(options.peer)}/sensor-nodes/${encodeURIComponent(nodeId)}`,
        ),
      );
    });

  const videoSession = passthrough
    .command('video-session <nodeId>')
    .description('Create a video playback session (live if neither date is set, VOD otherwise).')
    .requiredOption('--peer <peerId>')
    .option('--start-date <iso8601>')
    .option('--end-date <iso8601>')
    .action(
      async (nodeId: string, options: { peer: string; startDate?: string; endDate?: string }) => {
        const client = resolveClientConfig(videoSession.optsWithGlobals());
        printResult(
          await request(
            client,
            'POST',
            `/peers/${encodeURIComponent(options.peer)}/video/playback/${encodeURIComponent(nodeId)}/session`,
            { startDate: options.startDate, endDate: options.endDate },
          ),
        );
      },
    );

  const recordings = passthrough
    .command('recordings <nodeId>')
    .description('List available VOD recordings for a sensor node.')
    .requiredOption('--peer <peerId>')
    .action(async (nodeId: string, options: { peer: string }) => {
      const client = resolveClientConfig(recordings.optsWithGlobals());
      printResult(
        await request(
          client,
          'GET',
          `/peers/${encodeURIComponent(options.peer)}/video/playback/${encodeURIComponent(nodeId)}/recordings`,
        ),
      );
    });

  const analyticsEvent = passthrough
    .command('image-analytics-event <eventId>')
    .description('Fetch the detail of a single image-analytics event from a peer.')
    .requiredOption('--peer <peerId>')
    .action(async (eventId: string, options: { peer: string }) => {
      const client = resolveClientConfig(analyticsEvent.optsWithGlobals());
      printResult(
        await request(
          client,
          'GET',
          `/peers/${encodeURIComponent(options.peer)}/image-analytics/${encodeURIComponent(eventId)}`,
        ),
      );
    });
}
