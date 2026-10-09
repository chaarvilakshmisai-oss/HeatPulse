import React from 'react';
import RoomTile from './RoomTile.jsx';

export default function RoomGrid({ rooms, getRoomScore, selectedRoomId, onSelectRoom }) {
  const topRowRooms = rooms.filter(r => r.id >= 301 && r.id <= 306);
  const bottomRowRooms = rooms.filter(r => r.id >= 311 && r.id <= 316);

  return (
    <div className="room-grid-container" role="region" aria-label="Floor 3 Room Grid">
      <div className="grid-row top-row">
        {topRowRooms.map(room => (
          <RoomTile
            key={room.id}
            room={room}
            score={getRoomScore(room)}
            isSelected={room.id === selectedRoomId}
            onSelect={onSelectRoom}
          />
        ))}
      </div>

      <div className="corridor-strip" aria-hidden="true">
        <span className="corridor-line"></span>
        <span className="corridor-label">CORRIDOR</span>
        <span className="corridor-line"></span>
      </div>

      <div className="grid-row bottom-row">
        {bottomRowRooms.map(room => (
          <RoomTile
            key={room.id}
            room={room}
            score={getRoomScore(room)}
            isSelected={room.id === selectedRoomId}
            onSelect={onSelectRoom}
          />
        ))}
      </div>
    </div>
  );
}
