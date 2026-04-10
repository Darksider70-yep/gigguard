import os

with open("backend/src/workers/claimValidation.ts", "r") as f:
    content = f.read()

old_update = """  await query(
    `UPDATE claims
     SET fraud_score=$1, isolation_forest_score=$1,
         gnn_fraud_score=$2, graph_flags=$3
     WHERE id=$4`,
    [
      fraudResult.fraud_score,
      fraudResult.gnn_fraud_score,
      JSON.stringify(fraudResult.graph_flags),
      claim_id,
    ]
  );"""

new_update = """  let bcsScore = 100;
  if (fraudResult.bcs_tier === 2 || fraudResult.tier === 2) bcsScore = 60;
  if (fraudResult.bcs_tier === 3 || fraudResult.tier === 3) bcsScore = 20;

  const rec = fraudResult.recommendation || (fraudResult.tier === 3 ? 'deny' : 'approve');

  await query(
    `UPDATE claims
     SET fraud_score=$1,
         isolation_forest_score=$2,
         gnn_fraud_score=$3,
         graph_flags=$4,
         bcs_score=$5
     WHERE id=$6`,
    [
      fraudResult.fraud_score,
      fraudResult.isolation_forest_score || fraudResult.fraud_score,
      fraudResult.gnn_score || fraudResult.gnn_fraud_score,
      fraudResult.graph_flags ? JSON.stringify(fraudResult.graph_flags) : null,
      bcsScore,
      claim_id,
    ]
  );"""

if old_update in content:
    content = content.replace(old_update, new_update)

old_routing = """  if (fraudResult.tier === 3) {
    const bcsScore = Math.round((1 - fraudResult.fraud_score) * 100);
    await query(
      `UPDATE claims
       SET status='under_review', bcs_score=$1
       WHERE id=$2`,
      [bcsScore, claim_id]
    );
    logger.warn('ClaimValidation', 'held_for_review', {
      claim_id,
      bcs_score: bcsScore,
      graph_flags: fraudResult.graph_flags,
    });
    return;
  }

  await query(
    `UPDATE claims
     SET status='approved'
     WHERE id=$1`,
    [claim_id]
  );"""

new_routing = """  if (rec === 'deny') {
    await query(`UPDATE claims SET status='flagged' WHERE id=$1`, [claim_id]);
    logger.warn('ClaimValidation', 'flagged_denied', { claim_id, bcs_score: bcsScore });
    return;
  } else if (rec === 'review') {
    await query(`UPDATE claims SET status='under_review' WHERE id=$1`, [claim_id]);
    logger.warn('ClaimValidation', 'held_for_review', { claim_id, bcs_score: bcsScore });
    return;
  }

  // approve
  await query(`UPDATE claims SET status='approved' WHERE id=$1`, [claim_id]);"""

if old_routing in content:
    content = content.replace(old_routing, new_routing)

with open("backend/src/workers/claimValidation.ts", "w") as f:
    f.write(content)

print("Patched claimValidation.ts")
