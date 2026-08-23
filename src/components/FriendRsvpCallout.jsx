import Avatar from './Avatar';

// "N friends are going" indicator, shared by the calendar list, the event lightbox,
// and the club page's add-event card. Avatars reuse .friend-avatar-img/-overflow
// (ClubGrid.css) so this reads the same as the club card's friend-avatars-left row.
export default function FriendRsvpCallout({ friends }) {
  if (!friends || friends.length === 0) return null;

  return (
    <div className="friend-rsvp-callout">
      <div className="friend-rsvp-avatars">
        {friends.slice(0, 3).map((f) => (
          <Avatar
            key={f.id}
            url={f.avatar_url}
            firstName={f.first_name}
            lastName={f.last_name}
            username={f.username}
            className="friend-avatar-img"
          />
        ))}
        {friends.length > 3 && (
          <span className="friend-avatar-overflow">+{friends.length - 3}</span>
        )}
      </div>
      <span className="friend-rsvp-text">
        {friends.length === 1
          ? `${friends[0].username} is going`
          : `${friends[0].username} and ${friends.length - 1} ${friends.length - 1 === 1 ? 'other' : 'others'} you know are going`}
      </span>
    </div>
  );
}
