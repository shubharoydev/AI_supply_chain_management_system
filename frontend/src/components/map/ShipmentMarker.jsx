
import { Marker, InfoWindow } from '@react-google-maps/api';
import { useState } from 'react';

export default function ShipmentMarker({
  position,
  title,
  statusColor = 'normal', // 'normal', 'risk', 'delay'
  onClick,
}) {
  const [showInfo, setShowInfo] = useState(false);

  const colorMap = {
    normal: '#10b981', // green
    risk: '#f59e0b',   // amber/yellow
    delay: '#ef4444',  // red
  };

  const markerIcon = {
    path: window.google?.maps?.SymbolPath?.CIRCLE,
    fillColor: colorMap[statusColor] || '#6366f1',
    fillOpacity: 0.9,
    strokeWeight: 2,
    strokeColor: '#ffffff',
    scale: 10,
  };

  return (
    <>
      <Marker
        position={position}
        icon={markerIcon}
        title={title}
        onClick={() => {
          setShowInfo(true);
          onClick?.();
        }}
      />

      {showInfo && (
        <InfoWindow
          position={position}
          onCloseClick={() => setShowInfo(false)}
        >
          <div className="min-w-[180px] p-1">
            <h4 className="font-medium">{title || 'Shipment'}</h4>
            <p className="text-sm text-gray-600 mt-1">
              Status: <strong className={statusColor === 'delay' ? 'text-red-600' : ''}>
                {statusColor.toUpperCase()}
              </strong>
            </p>
          </div>
        </InfoWindow>
      )}
    </>
  );
}