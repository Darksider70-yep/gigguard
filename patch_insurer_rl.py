import os

with open('backend/src/routes/insurer.ts', 'r') as f:
    insurer_ts = f.read()

rl_rollout = """
router.post('/rl-rollout', authenticateInsurer, asyncRoute(async (req, res) => {
  const { rollout_percentage, kill_switch_engaged } = req.body;
  if (rollout_percentage !== undefined) {
    const p = Number(rollout_percentage);
    if (!isNaN(p) && p >= 0 && p <= 100) {
      await query(`UPDATE rl_rollout_config SET rollout_percentage = $1 WHERE id = 1`, [p]);
    }
  }
  if (kill_switch_engaged !== undefined) {
    await query(`UPDATE rl_rollout_config SET kill_switch_engaged = $1 WHERE id = 1`, [Boolean(kill_switch_engaged)]);
  }
  
  const { rows } = await query('SELECT * FROM rl_rollout_config WHERE id = 1');
  res.json({ success: true, config: rows[0] });
}));

export default router;
"""

insurer_ts = insurer_ts.replace('export default router;', rl_rollout)

with open('backend/src/routes/insurer.ts', 'w') as f:
    f.write(insurer_ts)

print('Patched insurer rollout route')
