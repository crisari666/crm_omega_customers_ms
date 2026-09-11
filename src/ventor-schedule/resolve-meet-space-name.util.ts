/**
 * Resolves a Calendar meeting code (or space id) to the Meet REST space name.
 * Workspace Events requires the canonical resource id, not the typeable meeting code.
 */
export async function resolveMeetSpaceResourceName(input: {
  readonly meetingCodeOrSpaceId: string;
  readonly accessToken: string;
}): Promise<{ readonly resourceName: string; readonly spaceId: string }> {
  const raw = input.meetingCodeOrSpaceId.replace(/^spaces\//, '').trim();
  if (!raw) {
    throw new Error('Meet space id is empty');
  }
  const response = await fetch(
    `https://meet.googleapis.com/v2/spaces/${encodeURIComponent(raw)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      detail
        ? `Meet space resolve failed (${response.status}): ${detail}`
        : `Meet space resolve failed (${response.status})`,
    );
  }
  const data = (await response.json()) as { name?: string };
  const resourceName = data.name?.trim();
  if (!resourceName || !resourceName.startsWith('spaces/')) {
    throw new Error('Meet API did not return a spaces/* resource name');
  }
  return {
    resourceName,
    spaceId: resourceName.replace(/^spaces\//, ''),
  };
}
