import { NextResponse } from 'next/server';
import {
  fetchTikTokCreatorInfo,
  filterTikTokPrivacyOptionsForClient,
  TIKTOK_PRIVACY_LABELS,
} from '@/lib/postman/tiktokCreatorInfo';
import { getOrRefreshTikTokToken } from '@/lib/postman/tiktokToken';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { accessToken } = await getOrRefreshTikTokToken();
    if (!accessToken) {
      return NextResponse.json({ success: false, error: 'TikTok non connesso.' }, { status: 401 });
    }

    const creatorInfo = await fetchTikTokCreatorInfo(accessToken);
    const privacyLevelOptions = filterTikTokPrivacyOptionsForClient(creatorInfo.privacyLevelOptions);

    return NextResponse.json({
      success: true,
      creator: {
        nickname: creatorInfo.creatorNickname,
        username: creatorInfo.creatorUsername,
        avatarUrl: creatorInfo.creatorAvatarUrl,
        privacyLevelOptions: privacyLevelOptions.map((value) => ({
          value,
          label: TIKTOK_PRIVACY_LABELS[value] || value,
        })),
        commentDisabled: creatorInfo.commentDisabled,
        duetDisabled: creatorInfo.duetDisabled,
        stitchDisabled: creatorInfo.stitchDisabled,
        maxVideoPostDurationSec: creatorInfo.maxVideoPostDurationSec,
        requiresPrivatePost: creatorInfo.requiresPrivatePost,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
