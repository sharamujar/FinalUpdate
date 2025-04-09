"use client";

import { useState, useEffect } from "react";
import {
  collection,
  query,
  orderBy,
  updateDoc,
  doc,
  getDoc,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/app/firebase-config";
import ProtectedRoute from "@/app/components/protectedroute";
import Sidebar from "@/app/components/Sidebar";

interface Order {
  id: string;
  userId?: string;
  userDetails?: {
    firstName: string;
    lastName: string;
  };
  orderDetails: {
    pickupTime: string;
    pickupDate: string;
    status: string;
    totalAmount: number;
    paymentMethod: string;
    paymentStatus?: string;
    gcashReference?: string;
    createdAt: string;
  };
  items: Array<{
    cartId: string;
    productSize: string;
    productVarieties: string[];
    productQuantity: number;
    productPrice: number;
  }>;
}

export default function PendingVerificationPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Function to fetch user details
  const fetchUserDetails = async (userId: string | undefined) => {
    try {
      if (!userId) {
        return {
          firstName: "Walk-in",
          lastName: "Customer"
        };
      }

      const userRef = doc(db, "customers", userId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.name) {
          const nameParts = data.name.split(" ");
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(" ") || "";
          return {
            firstName,
            lastName,
          };
        } else {
          return {
            firstName: data.firstName || "N/A",
            lastName: data.lastName || ""
          };
        }
      }
      return {
        firstName: "Unknown",
        lastName: "Customer"
      };
    } catch (error) {
      console.error("Error fetching user details:", error);
      return {
        firstName: "Unknown",
        lastName: "Customer"
      };
    }
  };

  // Function to update payment status
  const updatePaymentStatus = async (orderId: string, newStatus: string) => {
    try {
      const orderRef = doc(db, "orders", orderId);
      await updateDoc(orderRef, {
        "orderDetails.paymentStatus": newStatus,
        "orderDetails.updatedAt": new Date().toISOString(),
      });

      setOrders((prevOrders) =>
        prevOrders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                orderDetails: {
                  ...o.orderDetails,
                  paymentStatus: newStatus,
                },
              }
            : o
        )
      );
    } catch (err) {
      console.error("Error updating payment status:", err);
      setError("Failed to update payment status. Please try again.");
    }
  };

  // Fetch orders from Firestore
  useEffect(() => {
    const ordersRef = collection(db, "orders");
    // First, let's log what we're querying for
    console.log("Setting up GCash orders query");

    const q = query(
      ordersRef,
      where("orderDetails.paymentMethod", "in", ["GCash", "gcash", "GCASH"]),
      orderBy("orderDetails.createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      async (querySnapshot) => {
        console.log("Received snapshot with", querySnapshot.size, "documents");
        const ordersList = await Promise.all(
          querySnapshot.docs.map(async (doc) => {
            const data = doc.data();
            console.log("Order data:", data);  // Log each order's data
            const userDetails = await fetchUserDetails(data.userId);
            return {
              id: doc.id,
              userId: data.userId,
              orderDetails: {
                ...data.orderDetails,
                paymentMethod: data.orderDetails?.paymentMethod || "GCash",
                paymentStatus: data.orderDetails?.paymentStatus || "pending",
                totalAmount: data.orderDetails?.totalAmount || 0,
                gcashReference: data.orderDetails?.gcashReference || "N/A",
                createdAt: data.orderDetails?.createdAt || new Date().toISOString(),
              },
              items: data.items || [],
              userDetails,
            } as Order;
          })
        );
        console.log("Processed orders:", ordersList);  // Log processed orders
        setOrders(ordersList);
        setIsLoading(false);
        setError(null);
      },
      (error) => {
        console.error("Error in orders listener:", error);
        setError("Failed to load orders. Please try again later.");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filter orders based on search term
  const filteredOrders = orders.filter((order) => {
    const searchString = searchTerm.toLowerCase();
    return (
      order.id.toLowerCase().includes(searchString) ||
      (order.userDetails &&
        `${order.userDetails.firstName} ${order.userDetails.lastName}`
          .toLowerCase()
          .includes(searchString))
    );
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-4 md:mb-0">
              Payment Verification
            </h1>
            <div className="w-full md:w-auto">
              <input
                type="text"
                placeholder="Search by Order ID or Customer Name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-96 border p-2 rounded shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reference Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4">
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        </div>
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4">
                        No pending verifications found.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            #{order.id.slice(0, 6)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDate(order.orderDetails.createdAt)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {order.userDetails
                              ? `${order.userDetails.firstName} ${order.userDetails.lastName}`.trim()
                              : order.userId ? "Loading..." : "Walk-in Customer"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            ₱{order.orderDetails.totalAmount.toLocaleString()}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {order.orderDetails.gcashReference || "N/A"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            order.orderDetails.paymentStatus === "approved"
                              ? "bg-green-100 text-green-800"
                              : order.orderDetails.paymentStatus === "rejected"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}>
                            {order.orderDetails.paymentStatus || "pending"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex space-x-2">
                            {order.orderDetails.paymentStatus !== "approved" && (
                              <button
                                onClick={() => updatePaymentStatus(order.id, "approved")}
                                className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium hover:bg-green-200"
                              >
                                Approve
                              </button>
                            )}
                            {order.orderDetails.paymentStatus !== "rejected" && (
                              <button
                                onClick={() => updatePaymentStatus(order.id, "rejected")}
                                className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium hover:bg-red-200"
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
