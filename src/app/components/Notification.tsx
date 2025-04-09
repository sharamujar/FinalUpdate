/* import React from 'react';

interface Notification {
    message: string;
    type: 'success' | 'error';
}

interface NotificationProps {
    notifications: Notification[];
    onClose: () => void;
}

const Notification: React.FC<NotificationProps> = ({ notifications, onClose }) => {
    return (
        <div className="absolute top-4 right-4 p-4 bg-white shadow-lg rounded">
            {notifications.map((notification, index) => (
                <div key={index} className={`p-2 mb-2 rounded ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white`}>
                    {notification.message}
                </div>
            ))}
            <button onClick={onClose} className="text-gray-700">Close</button>
        </div>
    );
};

export default Notification;*/
