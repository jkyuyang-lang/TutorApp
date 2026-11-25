export const lessonStatusColors: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800",
  completed: "bg-blue-100 text-blue-800",
  canceled: "bg-red-100 text-red-800",
  late_cancel: "bg-orange-100 text-orange-800",
  no_show: "bg-gray-100 text-gray-800",
};

export const paymentStatusColors: Record<string, string> = {
  succeeded: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-blue-100 text-blue-800",
  partially_refunded: "bg-orange-100 text-orange-800",
};

export const goalStatusColors: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  met: "bg-green-100 text-green-800",
};

export const roleColors: Record<string, string> = {
  superadmin: "bg-red-100 text-red-800",
  tutor: "bg-blue-100 text-blue-800",
  client: "bg-green-100 text-green-800",
};
