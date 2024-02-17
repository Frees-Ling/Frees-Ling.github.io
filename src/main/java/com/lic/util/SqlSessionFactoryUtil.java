String resource = "mybatis-config.xml";

InputStream inputStream = Resources.getResourceAsStream(resource);

SqlSessionFactory sqlSessionFactory = new 
 SqlSessionFactoryBuilder().build(inputStream);

 public class SqlSessionFactoryUtil {
    //SqlSessionFactory工具类抽取
        private static SqlSessionFactory sqlSessionFactory;
        static {
            //静态代码块会随着类的加载而加载 只执行一次
    
            //加载Mybatis的核心配置文件
            String resource = "mybatis-config.xml";
            InputStream resourceAsStream = null;
            try {
                resourceAsStream = Resources.getResourceAsStream(resource);
            } catch (IOException e) {
                e.printStackTrace();
            }
            //  获取sqlSessionFactory对象
            sqlSessionFactory = new SqlSessionFactoryBuilder().build(resourceAsStream);
       }
        public static SqlSessionFactory getSqlSessionFactory (){
    
            return sqlSessionFactory;
        }
    }
    