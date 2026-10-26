import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DataManager } from '../../data/dataManager';
import { setClaudeHome } from '../../data/claudeHome';

suite('DataManager', () => {
  let homeA: string;
  let homeB: string;

  setup(async () => {
    homeA = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-home-a-'));
    homeB = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-home-b-'));
    const projectDir = path.join(homeA, 'projects', '-tmp-project');
    await fs.mkdir(projectDir, { recursive: true });
    const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    await fs.writeFile(path.join(projectDir, 'session.jsonl'), JSON.stringify({
      type: 'assistant',
      uuid: 'u1',
      timestamp: new Date().toISOString(),
      message: { id: 'msg_1', usage },
    }));
  });

  teardown(async () => {
    setClaudeHome('.claude');
    DataManager.getInstance().restartWatching();
    await fs.rm(homeA, { recursive: true, force: true });
    await fs.rm(homeB, { recursive: true, force: true });
  });

  test('heatmap follows claudeHome changes without waiting for the TTL', async () => {
    const dm = DataManager.getInstance();
    const totalCost = (d: Awaited<ReturnType<DataManager['getHeatmapData']>>) =>
      (d?.daily ?? []).reduce((sum, day) => sum + day.cost, 0);

    setClaudeHome(homeA);
    dm.restartWatching();
    assert.ok(totalCost(await dm.getHeatmapData()) > 0, 'heatmap should include homeA usage');

    setClaudeHome(homeB);
    dm.restartWatching();
    assert.strictEqual(totalCost(await dm.getHeatmapData()), 0, 'heatmap should not keep homeA usage');
  });
});
