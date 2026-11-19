function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function salesSnapshot(deal) {
  const value = typeof deal.value === 'number' || (typeof deal.value === 'string' && deal.value.trim()) ? Number(deal.value) : NaN;
  return {
    status: deal.status,
    finishedAt: timestamp(deal.finishedAt),
    value: Number.isFinite(value) && value >= 0 ? value : null,
    userId: deal.userId ?? null,
    products: (Array.isArray(deal.products) ? deal.products : []).map(product => product?.productId ?? product?.product?.id ?? product?.id).filter(id => id != null),
    verifiedAt: new Date().toISOString()
  };
}

export async function refreshSales(deals) {
  const {rows} = await deals.store.pool.query(`
    SELECT d.id,d.connection_id,d.remote_id,d.client_id,d.reporting_checked_at::text AS reporting_checked_at
    FROM crm_deals d
    JOIN whatsapp_connections c ON c.id=d.connection_id
    JOIN companies e ON e.id=c.company_id AND e.active
    JOIN crm_settings s ON s.connection_id=d.connection_id AND s.enabled
    WHERE d.state='linked' AND d.remote_id IS NOT NULL
      AND (d.reporting_checked_at IS NULL OR d.reporting_checked_at<now()-interval '1 hour')
      AND ($1::text IS NULL OR d.connection_id=$1)
    ORDER BY d.reporting_checked_at NULLS FIRST,d.id LIMIT 5
  `, [deals.crm.connectionId]);
  await Promise.all(rows.map(async row => {
    // Claim the refresh before the network call so processes do not repeat it.
    const claim = await deals.store.pool.query(`
      UPDATE crm_deals SET reporting_checked_at=now()
      WHERE id=$1 AND remote_id=$2 AND reporting_checked_at IS NOT DISTINCT FROM $3::timestamptz
      RETURNING reporting_checked_at::text AS stamp
    `, [row.id,row.remote_id,row.reporting_checked_at]);
    const stamp = claim.rows[0]?.stamp;
    if (!stamp) return;
    let snapshot;
    try {
      snapshot = salesSnapshot(await deals.read(row));
    } catch {
      // Keep the last confirmation. The report exposes stale and unverified links.
      return;
    }
    await deals.store.pool.query(`
      UPDATE crm_deals SET reporting_snapshot=$4
      WHERE id=$1 AND remote_id=$2 AND reporting_checked_at=$3::timestamptz
    `, [row.id,row.remote_id,stamp,snapshot]);
  }));
}
