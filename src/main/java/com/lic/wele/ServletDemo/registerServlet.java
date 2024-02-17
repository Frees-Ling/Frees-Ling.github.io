@WebServlet("/registerServlet")
public class registerServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        //第一步：接收用户名、密码

        String username;
        String password;
        username= req.getParameter("username");
        password= req.getParameter("password");


        byte[] bytes = username.getBytes(StandardCharsets.ISO_8859_1);
        username = new String(bytes, StandardCharsets.UTF_8);
        byte[] bytes1 = password.getBytes(StandardCharsets.ISO_8859_1);
        password = new String(bytes1, StandardCharsets.UTF_8);
        //封装用户对象
        User user1 = new User();
        user1.setUsername(username);
        user1.setPassword(password);


        //第二步：调用Mybatis查询用户
        //加载Mybatis的核心配置文件
        SqlSessionFactory sqlSessionFactory = SqlSessionFactoryUtil.getSqlSessionFactory();
        //  获取sqlSession对象，执行sql
        SqlSession sqlSession = sqlSessionFactory.openSession();
        //获取UserMapper接口的代理对象
        UserMapper mapper = sqlSession.getMapper(UserMapper.class);
        //获取方法
        User user = mapper.selectByUsername(username);


        //获取字符的输出流 设置content-type
        resp.setContentType("text/html;charset=utf-8");
        PrintWriter writer = resp.getWriter();
        //第三步：判断
        if(user==null){
            //用户名不存在，添加用户
            mapper.add(user1);
            //提交事务
            sqlSession.commit();
            sqlSession.close();
        }else {
            //用户存在，给出提示信息
            writer.write("用户已存在");
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {

        this.doGet(req, resp);
    }
}
