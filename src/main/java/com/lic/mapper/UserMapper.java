public interface UserMapper {

    /**
     *根据用户名 密码 查询用户
     * @param username
     * @param password
     * @return
     */
    @Select("select* from tb_user where username =#{username} and password = #{password}")
    User select(@Param("username") String username, @Param("password") String password);


}
public interface UserMapper {
    /**
     * 根据用户名查询用户对象
     * @param username
     * @return
     */
    @Select("select* from tb_user where username =#{username}")
    User selectByUsername(String username);

    /**
     * 添加用户
     */
    @Select("insert into tb_user values(null,#{username},#{password})")
    void add(User user);
}

