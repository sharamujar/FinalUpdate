"use client"; // Required for using hooks

import { useRouter } from "next/navigation";
import { storage, db } from "../firebase-config";
import ProtectedRoute from "@/app/components/protectedroute";
import { useEffect, useState } from "react";
import { addDoc, collection, doc, getDocs, updateDoc, deleteDoc, query, where, orderBy } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase-config";
import { 
    UserPlus, 
    Users as UsersIcon, 
    UserCog, 
    History, 
    Star, 
    MessageSquare, 
    Activity,
    Search,
    Filter,
    Edit,
    Trash2,
    Shield,
    UserCheck
} from 'lucide-react';

interface User {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'staff';
    status: 'active' | 'inactive';
    permissions: string[];
    lastLogin?: Date;
    createdAt: Date;
}

interface ActivityLog {
    id: string;
    userId: string;
    action: string;
    timestamp: Date;
    details: string;
    metadata?: string;
}

// Define available modules and their permissions
const modulePermissions = {
    inventory: {
        name: 'Inventory Management',
        permissions: [
            { id: 'view_inventory', name: 'View Inventory' },
            { id: 'manage_stock', name: 'Manage Stock' },
            { id: 'add_stock', name: 'Add New Stock' },
            { id: 'edit_stock', name: 'Edit Stock' },
            { id: 'delete_stock', name: 'Delete Stock' }
        ]
    },
    orders: {
        name: 'Order Management',
        permissions: [
            { id: 'view_orders', name: 'View Orders' },
            { id: 'process_orders', name: 'Process Orders' },
            { id: 'cancel_orders', name: 'Cancel Orders' }
        ]
    },
    reports: {
        name: 'Reports',
        permissions: [
            { id: 'view_reports', name: 'View Reports' },
            { id: 'export_reports', name: 'Export Reports' }
        ]
    },
    users: {
        name: 'User Management',
        permissions: [
            { id: 'view_users', name: 'View Users' },
            { id: 'manage_users', name: 'Manage Users' }
        ]
    }
};

export default function Users() {
    const [users, setUsers] = useState<User[]>([]);
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    const [selectedTab, setSelectedTab] = useState<'staff'>('staff');
    const [showActivityLog, setShowActivityLog] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalType, setModalType] = useState<'add' | 'edit' | 'permissions' | 'profile'>('add');

    const [userForm, setUserForm] = useState({
        name: "",
        email: "",
        role: "staff",
        status: "active",
        password: "",
        phoneNumber: "",
        address: "",
        permissions: [] as string[],
    });

    useEffect(() => {
        fetchUsers();
        fetchActivityLogs();
    }, [selectedTab]);

    const fetchUsers = async () => {
        try {
            console.log("Current selected tab:", selectedTab); // Debugging log
            const userQuery = query(
                collection(db, "users"),
                where("role", "==", selectedTab === 'staff' ? 'staff' : 'admin'),
                orderBy("createdAt", "desc")
            );

            const querySnapshot = await getDocs(userQuery);
            const userList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate(),
                lastLogin: doc.data().lastLogin?.toDate(),
            })) as User[];

            console.log("Fetched users:", userList); // Debugging log
            setUsers(userList);
        } catch (error) {
            console.error("Error fetching users:", error);
            alert("Failed to load users");
        }
    };

    const fetchActivityLogs = async () => {
        try {
            const logsQuery = query(
                collection(db, "activityLogs"),
                orderBy("timestamp", "desc")
            );
            const querySnapshot = await getDocs(logsQuery);
            const logsList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate(),
            })) as ActivityLog[];
            setActivityLogs(logsList);
        } catch (error) {
            console.error("Error fetching activity logs:", error);
        }
    };

    const logActivity = async (
        userId: string,
        action: string,
        details: string,
        metadata?: string
    ) => {
        try {
            const user = users.find(u => u.id === userId);
            await addDoc(collection(db, "activityLogs"), {
                userId,
                userName: user?.name || 'Unknown',
                userRole: user?.role || 'Unknown',
                action,
                details,
                metadata,
                timestamp: new Date(),
            });
            fetchActivityLogs();
        } catch (error) {
            console.error("Error logging activity:", error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) {
                throw new Error('You must be logged in to perform this action');
            }

            // Check if current user is admin
            const currentUserDoc = await getDocs(query(
                collection(db, "users"),
                where("email", "==", currentUser.email)
            ));
            
            const currentUserData = currentUserDoc.docs[0]?.data();
            if (currentUserData?.role !== 'admin') {
                throw new Error('Only administrators can manage users');
            }

            const userData = {
                name: userForm.name,
                email: userForm.email,
                role: userForm.role,
                status: userForm.status,
                permissions: userForm.role === 'admin' 
                    ? Object.values(modulePermissions)
                        .flatMap(module => module.permissions)
                        .map(p => p.id)
                    : userForm.permissions || [],
                updatedAt: new Date(),
            };

            if (modalType === 'edit') {
                await updateDoc(doc(db, "users", selectedUser!.id), userData);
                await logActivity(
                    currentUser.uid,
                    "user_updated",
                    `Updated user permissions for ${userForm.name}`,
                    JSON.stringify(userData.permissions)
                );
            } else {
                const userCredential = await createUserWithEmailAndPassword(
                    auth,
                    userForm.email,
                    userForm.password
                );
                
                await addDoc(collection(db, "users"), {
                    ...userData,
                    uid: userCredential.user.uid,
                    createdAt: new Date(),
                });

                await logActivity(
                    currentUser.uid,
                    "user_created",
                    `Created new ${userForm.role} account: ${userForm.name}`,
                    JSON.stringify(userData.permissions)
                );
            }

            setIsModalOpen(false);
            resetForm();
            fetchUsers();
        } catch (error) {
            console.error("Error handling user:", error);
            alert(error instanceof Error ? error.message : "Failed to process user");
        }
    };

    const resetForm = () => {
        setUserForm({
            name: "",
            email: "",
            role: "staff",
            status: "active",
            password: "",
            phoneNumber: "",
            address: "",
            permissions: [],
        });
        setSelectedUser(null);
    };

    const filteredUsers = users.filter(user => {
        const matchesSearch = 
            user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || user.role === roleFilter;
        const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
        return matchesSearch && matchesRole && matchesStatus;
    });

    console.log("Selected Tab:", selectedTab);

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-gray-100 p-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-800">User Management</h1>
                    <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-500" />
                        <span className="text-gray-600">Role-Based Access Control</span>
                    </div>
                </div>

                {/* Filters and Controls */}
                <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex-1 relative">
                            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search users..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 p-2 border rounded w-full"
                            />
                        </div>
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="p-2 border rounded"
                        >
                            <option value="all">All Roles</option>
                            <option value="admin">Admin</option>
                            <option value="staff">Staff</option>
                        </select>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="p-2 border rounded"
                        >
                            <option value="all">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                        <button
                            onClick={() => {
                                setModalType('add');
                                setIsModalOpen(true);
                            }}
                            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                        >
                            <UserPlus className="w-5 h-5 inline-block mr-2" />
                            Add New User
                        </button>
                    </div>
                </div>

                {/* Users Table */}
                <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    User Info
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Role & Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Permissions
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Last Activity
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredUsers.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <div>
                                                <div className="font-medium text-gray-900">{user.name}</div>
                                                <div className="text-sm text-gray-500">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs ${
                                            user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                                        }`}>
                                            {user.role}
                                        </span>
                                        <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                                            user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {user.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-500">
                                            {Array.isArray(user.permissions) && user.permissions.length > 0 
                                                ? `${user.permissions.length} permissions granted` 
                                                : 'No permissions'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-500">
                                            {user.lastLogin?.toLocaleDateString() || 'Never'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        {user.role !== 'admin' && (
                                            <button
                                                onClick={() => {
                                                    setSelectedUser(user);
                                                    setModalType('permissions');
                                                    setIsModalOpen(true);
                                                }}
                                                className="text-purple-600 hover:text-purple-900"
                                            >
                                                <Shield className="w-5 h-5 inline-block" />
                                            </button>
                                        )}
                        <button
                            onClick={() => {
                                                setSelectedUser(user);
                                                setModalType('edit');
                                                setIsModalOpen(true);
                                            }}
                                            className="text-blue-600 hover:text-blue-900"
                                        >
                                            <Edit className="w-5 h-5 inline-block" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Activity Log */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-blue-500" />
                            <h2 className="text-xl font-semibold">System Activity Log</h2>
                        </div>
                        <button
                            onClick={() => setShowActivityLog(!showActivityLog)}
                            className="text-blue-600 hover:text-blue-900"
                        >
                            {showActivityLog ? 'Hide Log' : 'Show Log'}
                        </button>
                    </div>
                    {showActivityLog && (
                        <div className="space-y-4">
                            {activityLogs.map((log) => (
                                <div key={log.id} className="flex items-center justify-between border-b pb-2">
                                    <div>
                                        <span className="font-medium">{log.action}</span>
                                        <p className="text-sm text-gray-500">{log.details}</p>
                                        {log.metadata && (
                                            <p className="text-xs text-gray-400">
                                                Changes: {log.metadata}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Modals */}
                {isModalOpen && modalType === 'permissions' && selectedUser && (
                    <PermissionsModal
                        user={selectedUser}
                        onClose={() => {
                            setIsModalOpen(false);
                            setSelectedUser(null);
                        }}
                        onSave={async (permissions) => {
                            try {
                                await updateDoc(doc(db, "users", selectedUser.id), {
                                    permissions,
                                    updatedAt: new Date()
                                });
                                await logActivity(
                                    selectedUser.id,
                                    "permissions_updated",
                                    `Updated permissions for ${selectedUser.name}`,
                                    JSON.stringify(permissions)
                                );
                                setIsModalOpen(false);
                                setSelectedUser(null);
                                fetchUsers();
                            } catch (error) {
                                console.error("Error updating permissions:", error);
                                alert("Failed to update permissions");
                            }
                        }}
                    />
                )}

                {/* Add/Edit User Modal */}
                {isModalOpen && (modalType === 'add' || modalType === 'edit') && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                        <div className="bg-white p-6 rounded-lg w-full max-w-md">
                            <h2 className="text-xl font-semibold mb-4">
                                {modalType === 'add' ? 'Add New User' : 'Edit User'}
                            </h2>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                        <input
                                            type="text"
                                    placeholder="Name"
                                    value={userForm.name}
                                    onChange={(e) => setUserForm({...userForm, name: e.target.value})}
                                    className="w-full p-2 border rounded"
                                            required
                                        />
                                        <input
                                            type="email"
                                    placeholder="Email"
                                    value={userForm.email}
                                    onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                                    className="w-full p-2 border rounded"
                                            required
                                        />
                                {modalType === 'add' && (
                                        <input
                                        type="password"
                                        placeholder="Password"
                                        value={userForm.password}
                                        onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                                        className="w-full p-2 border rounded"
                                            required
                                        />
                                )}
                                        <select
                                    value={userForm.role}
                                    onChange={(e) => setUserForm({...userForm, role: e.target.value as 'admin' | 'staff'})}
                                    className="w-full p-2 border rounded"
                                    required
                                >
                                    <option value="staff">Staff</option>
                                    <option value="admin">Admin</option>
                                        </select>
                                <select
                                    value={userForm.status}
                                    onChange={(e) => setUserForm({...userForm, status: e.target.value as 'active' | 'inactive'})}
                                    className="w-full p-2 border rounded"
                                            required
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                                <div className="flex justify-end gap-4">
                                        <button
                                            type="button"
                                        onClick={() => {
                                            setIsModalOpen(false);
                                            resetForm();
                                        }}
                                        className="px-4 py-2 text-gray-600 hover:text-gray-800"
                                        >
                                            Cancel
                                        </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                    >
                                        {modalType === 'add' ? 'Create User' : 'Save Changes'}
                                    </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
            </div>
        </ProtectedRoute>
    );
}

// Add this component for the permissions modal
const PermissionsModal = ({ user, onClose, onSave }: { user: { permissions: string[], name: string, role: string }, onClose: () => void, onSave: (permissions: string[]) => void }) => {
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>(user.permissions || []);

    const handlePermissionChange = (permissionId: string) => {
        setSelectedPermissions(prev => 
            prev.includes(permissionId)
                ? prev.filter(p => p !== permissionId)
                : [...prev, permissionId]
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                <h2 className="text-xl font-semibold mb-4">Manage Permissions for {user.name}</h2>
                <div className="space-y-6">
                    {Object.entries(modulePermissions).map(([moduleKey, module]) => (
                        <div key={moduleKey} className="border-b pb-4">
                            <h3 className="font-medium text-lg mb-2">{module.name}</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {module.permissions.map(permission => (
                                    <label key={permission.id} className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedPermissions.includes(permission.id)}
                                            onChange={() => handlePermissionChange(permission.id)}
                                            className="rounded border-gray-300"
                                            disabled={user.role === 'admin'} // Admin has all permissions
                                        />
                                        <span>{permission.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex justify-end gap-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(selectedPermissions)}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        Save Permissions
                    </button>
                </div>
            </div>
        </div>
    );
};
