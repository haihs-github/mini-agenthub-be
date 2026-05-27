const groupRepository = require("../repositories/groupRepository");

class GroupService {
  // BKAV HaiHS : sử lý tạo nhóm mới - start
  async createGroup(name, permissions, userIds) {
    // Kiểm tra xem tên nhóm đã tồn tại chưa
    const existingGroup = await groupRepository.findByName(name);
    if (existingGroup) {
      throw new Error("GROUP_ALREADY_EXISTS");
    }

    // đóng gói groupdata
    const groupData = {
      name: name,
      permissions: permissions || [],
    };

    // gán user vào nhóm nếu có
    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      groupData.users = {
        // Biến mảng số [1, 2] thành dạng [{ id: 1 }, { id: 2 }] theo đúng chuẩn Prisma
        connect: userIds.map((id) => ({ id: parseInt(id) })),
      };
    }

    return await groupRepository.create(groupData);
  }
  // BKAV HaiHS : sử lý tạo nhóm mới - end

  //   BKAV HaiHS : xử lý cập nhật cho nhóm - start
  async updateGroup(groupId, name, permissions) {
    // 1. Kiểm tra xem nhóm có tồn tại không
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new Error("GROUP_NOT_FOUND");
    }

    const updateData = {};

    // 2. Logic kiểm tra trùng tên nhóm
    if (name && name !== group.name) {
      const existingGroup = await groupRepository.findByName(name);
      if (existingGroup) {
        throw new Error("GROUP_ALREADY_EXISTS");
      }
      updateData.name = name; // Hợp lệ thì điền vào dữ liệu cập nhật
    }

    // 3. Logic kiểm tra quyền truyền lên
    if (permissions) {
      if (!Array.isArray(permissions)) {
        throw new Error("PERMISSIONS_MUST_BE_ARRAY");
      }
      updateData.permissions = permissions;
    }

    // 4. Tiến hành gọi Repo cập nhật những trường thay đổi
    return await groupRepository.update(groupId, updateData);
  }
  //   BKAV HaiHS : xử lý cập nhật cho nhóm - end

  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - start
  async addUsersToGroup(groupId, userIds) {
    // 1. Kiểm tra xem Nhóm có tồn tại thật không
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new Error("GROUP_NOT_FOUND");
    }

    // 2. Kiểm tra xem mảng userIds có rỗng không
    if (!userIds || userIds.length === 0) {
      throw new Error("USER_IDS_REQUIRED");
    }

    // 3. Tiến hành gán danh sách User vào Nhóm
    return await groupRepository.addUsersToGroup(groupId, userIds);
  }
  // BKAV HaiHS : xử lý thêm người dùng vào nhóm - end

  // BKAV HaiHS : xử lý xóa nhóm - start
  async deleteGroup(groupId) {
    // 1. Kiểm tra xem nhóm có tồn tại trong DB không
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new Error("GROUP_NOT_FOUND");
    }

    // 2. Tiến hành gọi Repo để xóa thẳng tay
    return await groupRepository.delete(groupId);
  }
  // BKAV HaiHS : xử lý xóa nhóm - end

  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - start
  async removeUsersFromGroup(groupId, userIds) {
    // 1. Kiểm tra nhóm có tồn tại không
    const group = await groupRepository.findById(groupId);
    if (!group) {
      throw new Error("GROUP_NOT_FOUND");
    }

    // 2. Kiểm tra mảng userIds đầu vào
    if (!userIds || userIds.length === 0) {
      throw new Error("USER_IDS_REQUIRED");
    }

    // 3. Gọi Repo xử lý cắt liên kết dưới DB
    return await groupRepository.removeUsersFromGroup(groupId, userIds);
  }
  // BKAV HaiHS : xử lý xóa người dùng khỏi nhóm - start

  // BKAV HaiHS : xử lý lấy danh sách nhóm có phân trang - start
  async getAllGroups(page, limit) {
    // 1. Tính toán vị trí bắt đầu bỏ qua (skip)
    const skip = (page - 1) * limit;
    const take = limit;

    // 2. Gọi Repo lấy dữ liệu
    const { groups, total } = await groupRepository.findAndCountAll(skip, take);

    // 3. Tính toán tổng số trang
    const totalPages = Math.ceil(total / limit);

    // 4. Trả về dữ liệu sạch kèm cấu trúc phân trang chuẩn chỉnh
    return {
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        permissions: g.permissions,
        memberCount: g._count.users, // Trả về số lượng thành viên trong nhóm
      })),
      pagination: {
        totalItems: total, // Tổng số nhóm trong DB
        totalPages: totalPages, // Tổng số trang
        currentPage: page, // Trang hiện tại
        limit: limit, // Số lượng phần tử trên 1 trang
      },
    };
  }
  // BKAV HaiHS : xử lý lấy danh sách nhóm có phân trang - end

  // BKAV HaiHS : xử lý lấy chi tiết nhóm (kèm danh sách thành viên) - start
  async getGroupDetail(groupId) {
    // 1. Gọi Repo check DB lấy nhóm kèm danh sách thành viên
    const group = await groupRepository.findByIdWithUsers(groupId);

    // 2. Nếu không tìm thấy nhóm, ném lỗi ra ngoài
    if (!group) {
      throw new Error("GROUP_NOT_FOUND");
    }

    return group;
  }
  // BKAV HaiHS : xử lý lấy chi tiết nhóm (kèm danh sách thành viên) - end
}

module.exports = new GroupService();
