import type { Character } from "@xstellar/shared";
import { CAMPAIGN_CHAPTERS, CAMPAIGN_CHAPTER_ORDER } from "@xstellar/shared";

interface CampaignPanelProps {
  character: Character;
  onStartChapter: (chapterId: string) => void;
}

export function CampaignPanel({ character, onStartChapter }: CampaignPanelProps) {
  return (
    <div className="campaign-panel">
      <h3>Campaign</h3>
      <ul className="campaign-chapter-list">
        {CAMPAIGN_CHAPTER_ORDER.map((chapterId, index) => {
          const chapter = CAMPAIGN_CHAPTERS[chapterId];
          const completed = character.completedChapterIds.includes(chapterId);
          const previousChapterId = index > 0 ? CAMPAIGN_CHAPTER_ORDER[index - 1] : null;
          const locked = previousChapterId !== null && !character.completedChapterIds.includes(previousChapterId);

          return (
            <li key={chapterId} className="campaign-chapter">
              <div className="campaign-chapter-header">
                <strong>{chapter.title}</strong>
                {completed && <span className="campaign-chapter-badge">Cleared</span>}
                {chapter.isMilestone && <span className="campaign-chapter-badge">+Character Slot</span>}
              </div>
              <p className="campaign-chapter-subtitle">{chapter.subtitle}</p>
              <p className="campaign-chapter-lore">{chapter.loreIntro}</p>
              <button disabled={locked} onClick={() => onStartChapter(chapterId)}>
                {locked ? "Locked" : completed ? "Replay Chapter" : "Begin Chapter"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
