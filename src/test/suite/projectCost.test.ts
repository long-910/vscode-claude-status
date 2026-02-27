import * as assert from 'assert';
import { workspacePathToHash } from '../../data/projectCost';

suite('ProjectCost', () => {
  suite('workspacePathToHash', () => {
    test('replaces forward slashes with hyphens', () => {
      assert.strictEqual(
        workspacePathToHash('/home/user/my-app'),
        '-home-user-my-app'
      );
    });

    test('replaces underscores with hyphens (verified against real data)', () => {
      // Real example: /home/long/sb_git/vscode-claude-status
      //             → -home-long-sb-git-vscode-claude-status
      assert.strictEqual(
        workspacePathToHash('/home/long/sb_git/vscode-claude-status'),
        '-home-long-sb-git-vscode-claude-status'
      );
    });

    test('replaces all non-alphanumeric chars with hyphens', () => {
      assert.strictEqual(
        workspacePathToHash('/mnt/c/Users/910lo/sb_git/my.app'),
        '-mnt-c-Users-910lo-sb-git-my-app'
      );
    });

    test('preserves alphanumeric characters', () => {
      const result = workspacePathToHash('/home/User123/project');
      assert.ok(!result.includes('/'));
      assert.ok(result.includes('User123'));
      assert.ok(result.includes('project'));
    });

    test('handles empty string', () => {
      assert.strictEqual(workspacePathToHash(''), '');
    });
  });
});
